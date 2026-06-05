import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import type { ClientEvents, ServerEvents } from './types'
import { createPlayer, getPlayer, setPlayerReady, setPlayerConnected } from './player'
import { createRoom, getRoom, joinRoom, leaveRoom } from './room'
import { initGame, handlePlay, handlePass, findLeadPlayer, settleGame } from './game-machine'
import { Rank, calculateScore } from '@79523/engine'

export function setupWebSocket(httpServer: HttpServer) {
  const io = new Server<ClientEvents, ServerEvents>(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } })

  io.on('connection', (socket) => {
    let currentPlayerId: string | null = null
    let currentRoomCode: string | null = null

    socket.on('create_room', ({ name, maxPlayers }) => {
      const room = createRoom(maxPlayers)
      const player = createPlayer(socket.id, name)
      joinRoom(room.code, player)
      currentPlayerId = player.id; currentRoomCode = room.code
      socket.join(room.code)
      socket.emit('room_created', { roomCode: room.code })
    })

    socket.on('join_room', ({ roomCode, playerName }) => {
      const player = createPlayer(socket.id, playerName)
      const room = joinRoom(roomCode, player)
      if (!room) { socket.emit('error', { message: 'Room not found or full' }); return }
      currentPlayerId = player.id; currentRoomCode = roomCode
      socket.join(roomCode)
      io.to(roomCode).emit('player_joined', { players: room.players.map(p => ({ ...p, socketId: '' })) })
    })

    socket.on('ready', () => {
      if (!currentPlayerId || !currentRoomCode) return
      setPlayerReady(currentPlayerId, true)
      const room = getRoom(currentRoomCode)
      if (!room) return
      if (room.players.every(p => p.ready) && room.players.length >= 2) {
        const game = initGame(room.players.map(p => p.id))
        room.game = game
        const leadPlayerId = findLeadPlayer(game)
        game.currentPlayerIndex = game.players.findIndex(p => p.id === leadPlayerId)
        for (const player of room.players) {
          const gp = game.players.find(p => p.id === player.id)!
          io.to(player.socketId).emit('game_started', { hand: gp.hand, players: game.players.map(p => ({ ...p, hand: [] })), leadPlayerId })
        }
        const leadSocket = room.players.find(p => p.id === leadPlayerId)!
        io.to(leadSocket.socketId).emit('your_turn', { timeout: 30 })
      }
    })

    socket.on('play', ({ cards }) => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.game) return
      const game = room.game
      if (game.players[game.currentPlayerIndex].id !== currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' }); return
      }
      const result = handlePlay(game, currentPlayerId, cards)
      if (!result.success) { socket.emit('error', { message: result.error || 'Invalid play' }); return }
      io.to(currentRoomCode).emit('play_made', { playerId: currentPlayerId, play: { type: 'play', cards }, tableCards: game.tableCards })
      if (result.roundWinner) {
        const scoreCards = game.tableCards.filter(c => {
          return c.rank === Rank.Five || c.rank === Rank.Ten || c.rank === Rank.King
        })
        io.to(currentRoomCode).emit('round_result', {
          winnerId: result.roundWinner, scoreCards,
          scores: game.players.map(p => ({ id: p.id, score: p.score })),
        })
        if (result.gameOver) {
          const settlement = settleGame(game)
          io.to(currentRoomCode).emit('game_over', { scores: settlement.scores, remainingScoreCards: [] })
          return
        }
      }
      if (!game.gameOver) {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        while (game.players[game.currentPlayerIndex].finished) game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        io.to(room.players[game.currentPlayerIndex].socketId).emit('your_turn', { timeout: 30 })
      }
    })

    socket.on('pass', () => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.game) return
      const game = room.game
      if (game.players[game.currentPlayerIndex].id !== currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' }); return
      }
      const result = handlePass(game, currentPlayerId)
      if (!result.success) { socket.emit('error', { message: result.error || 'Invalid pass' }); return }
      if (result.roundOver && result.roundWinner) {
        io.to(currentRoomCode).emit('round_result', {
          winnerId: result.roundWinner, scoreCards: [],
          scores: game.players.map(p => ({ id: p.id, score: p.score })),
        })
      }
      if (!game.gameOver) {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        io.to(room.players[game.currentPlayerIndex].socketId).emit('your_turn', { timeout: 30 })
      }
    })

    socket.on('boxer_move', () => {
      socket.emit('error', { message: 'Boxer king coming soon' })
    })

    socket.on('disconnect', () => {
      if (currentPlayerId && currentRoomCode) {
        setPlayerConnected(currentPlayerId, false)
        io.to(currentRoomCode).emit('player_disconnected', { playerId: currentPlayerId })
        setTimeout(() => {
          const player = getPlayer(currentPlayerId!)
          if (player && !player.connected) {
            leaveRoom(currentRoomCode!, currentPlayerId!)
            io.to(currentRoomCode!).emit('player_left', { playerId: currentPlayerId!, players: [] })
          }
        }, 30000)
      }
    })

    socket.on('reconnect', ({ roomCode, playerId }) => {
      const player = getPlayer(playerId)
      if (!player) { socket.emit('error', { message: 'Player not found' }); return }
      setPlayerConnected(playerId, true)
      socket.join(roomCode)
      currentPlayerId = playerId; currentRoomCode = roomCode
      io.to(roomCode).emit('player_reconnected', { playerId })
      const room = getRoom(roomCode)
      if (room?.game) {
        const gp = room.game.players.find(p => p.id === playerId)!
        socket.emit('full_state', { ...room.game, myHand: gp.hand, myId: playerId })
      }
    })
  })
  return io
}

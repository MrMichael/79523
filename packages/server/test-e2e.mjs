import { io } from 'socket.io-client'

function waitFor(socket, event, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${event}`)), timeout)
    socket.once(event, (data) => { clearTimeout(timer); resolve(data) })
  })
}

async function main() {
  const s1 = io('http://localhost:3000', { transports: ['websocket', 'polling'] })
  await waitFor(s1, 'connect')
  s1.emit('create_room', { name: 'Alice', maxPlayers: 4 })
  const { roomCode } = await waitFor(s1, 'room_created')
  console.log('Room:', roomCode)

  // Set up host listener BEFORE anyone joins
  let playerCount = 0
  s1.on('player_joined', (data) => {
    playerCount = data.players.length
    console.log('Host: player count =', playerCount)
  })

  const joinPlayer = async (name) => {
    const s = io('http://localhost:3000', { transports: ['websocket', 'polling'] })
    await waitFor(s, 'connect')
    s.emit('join_room', { roomCode, playerName: name })
    await waitFor(s, 'player_joined')
    return s
  }

  const s2 = await joinPlayer('Bob')
  console.log('Bob joined')
  const s3 = await joinPlayer('Charlie')
  console.log('Charlie joined')
  const s4 = await joinPlayer('Diana')
  console.log('Diana joined (host sees', playerCount, 'players)')

  // All ready
  const gs = [s1, s2, s3, s4].map(s => waitFor(s, 'game_started'))
  s1.emit('ready'); s2.emit('ready'); s3.emit('ready'); s4.emit('ready')
  const games = await Promise.all(gs)
  console.log('GAME STARTED! Hands:', games.map(g => g.hand.length))
  console.log('Lead:', games[0].leadPlayerId)
  console.log('PASS')

  s1.disconnect(); s2.disconnect(); s3.disconnect(); s4.disconnect()
  process.exit(0)
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })

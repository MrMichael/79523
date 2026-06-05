import { io } from 'socket.io-client'

const socket = io('http://localhost:3000', { transports: ['websocket', 'polling'] })

socket.on('connect', () => {
  console.log('S1 connected')
  socket.emit('create_room', { name: 'Host', maxPlayers: 4 })
  socket.on('room_created', ({ roomCode }) => {
    console.log('Room:', roomCode)
    const s2 = io('http://localhost:3000', { transports: ['websocket', 'polling'] })
    s2.on('connect', () => {
      console.log('S2 connected')
      s2.emit('join_room', { roomCode, playerName: 'Player2' })
    })
    s2.on('player_joined', (d) => console.log('JOIN OK:', JSON.stringify(d)))
    s2.on('error', (d) => console.log('JOIN FAIL:', d.message))
    socket.on('player_joined', (d) => console.log('Host sees:', JSON.stringify(d.players)))
  })
  socket.on('error', (d) => console.log('ERR:', d.message))
})

setTimeout(() => { console.log('DONE'); process.exit(0) }, 4000)

import register from './events/register.js';
import offer from './events/offer.js';
import privateMessage from './events/privateMessage.js';
import callUser from './events/callUser.js';
import acceptCall from './events/acceptCall.js'
import hangUp from './events/hangUp.js'
import answer from './events/answer.js'
import iceCandidate from './events/iceCandidate.js';
import disconnect from './events/disconnect.js'
import message from './events/message.js'
import emergencyCall from './events/emergencyCall.js'
import modeChange from './events/modeChange.js'
import registerAgent from './events/registerAgent.js'
export const users = new Map();
export const Agents = new Map();


export function getUserEmail(socketId) {
    for (const [email, id] of users.entries()) {
      if (id === socketId) return email;
    }
    return null;
  }

export const socketInit = (io) => {
    io.on('connection', (socket) => {
      console.log(`⚡: ${socket.id} user just connected!`);
      register(socket, users)

      offer(socket, users, io)

      privateMessage(socket, users, io)
    
      callUser(socket, users, io)
    
      acceptCall(socket, users, io)
    
      hangUp(socket, users, io)
    
      answer(socket, users, io)
    
      iceCandidate(socket, users, io)
    
      disconnect(socket, users, Agents)

      message(socket, users)

      emergencyCall(socket, users, io)

      modeChange(socket, users, io)

      // agentStatusChange(socket, Agents, agent, stat)

      registerAgent(socket, Agents)
    });
}
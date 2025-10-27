import { io } from '../app.js';
import { users } from '../socketIo/socketIo.js';

class ModeController {
  constructor() {
    this.changeMode = this.changeMode.bind(this);
  }

  async changeMode(req, res) {
    try {
      const { toEmail, mode } = req.body;
      const recipientSocketId = users.get(toEmail);

      if (!recipientSocketId) {
        return res.status(404).json({ success: false, message: 'Recipient not connected' });
      }

      io.to(recipientSocketId).emit('modeChange', { mode });
      res.json({ success: true, message: 'Mode change message sent' });
    } catch (error) {
      console.error("❌ Error in changeMode:", error);
      res.status(500).json({ success: false, error: 'Failed to change mode' });
    }
  }
}

export default new ModeController();
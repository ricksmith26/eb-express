import { io } from '../app.js';
import { getPreferredSocketId } from '../socketIo/socketIo.js';

class ModeController {
  constructor() {
    this.changeMode = this.changeMode.bind(this);
  }

  async changeMode(req, res) {
    try {
      const { toEmail, mode } = req.body;

      // Use priority routing to get preferred socket ID (web first, then mobile)
      const recipientSocketId = getPreferredSocketId(toEmail);

      if (!recipientSocketId) {
        console.log(`[ModeController] User ${toEmail} is not connected`);
        return res.status(404).json({ success: false, message: 'Recipient not connected' });
      }

      io.to(recipientSocketId).emit('modeChange', { mode });
      console.log(`[ModeController] Mode change sent to ${toEmail} on socket ${recipientSocketId}`);
      res.json({ success: true, message: 'Mode change message sent' });
    } catch (error) {
      console.error("❌ Error in changeMode:", error);
      res.status(500).json({ success: false, error: 'Failed to change mode' });
    }
  }
}

export default new ModeController();
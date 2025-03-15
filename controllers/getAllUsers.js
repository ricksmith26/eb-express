import User from "../models/User.js";

const UsersController = {
  async getAllUsers(req, res) {
    try {
      const users = await User.find(); // ✅ Find all users
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  },
  async getUsers(req, res){
    try {
      const users = await User.find(); // ✅ Find all users
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
}

export default UsersController;
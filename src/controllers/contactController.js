import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const saveMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const newMessage = {
      id: Date.now(),
      name,
      email,
      subject,
      message,
      timestamp: new Date().toISOString()
    };

    const dataPath = path.join(__dirname, '../../data/messages.json');

    let messages = [];
    try {
      const fileData = await fs.readFile(dataPath, 'utf8');
      messages = JSON.parse(fileData);
    } catch (error) {
      // If file doesn't exist or is empty, start with empty array
      messages = [];
    }

    messages.push(newMessage);

    await fs.writeFile(dataPath, JSON.stringify(messages, null, 2));

    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

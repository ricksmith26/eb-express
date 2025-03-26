import { API_URL } from '../config/vars.js'
import { jwtDecode } from "jwt-decode";
import { google } from "googleapis";
import User from '../models/User.js'

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob" // Use "oob" for refresh tokens
);

export async function uploadToFolder(folderId) {
  const fileMetadata = {
    name: 'photo.jpg',
    parents: [folderId],
  };
  const media = {
    mimeType: 'image/jpeg',
    body: fs.createReadStream('images/landscapes/fhir-server/images/landscapes/alaska-8448009_1280.jpg'),
  };

  try {
    const file = await service.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
    });
    console.log('File Id:', file.data.id);
    return file.data.id;
  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
}

const getBackUpImages = async () => {
  const email = 'kevinsmith262626@gmail.com'
  const user = await User.findOne({ email });
  auth.setCredentials({ refresh_token: user.refreshToken });
  google.options({ auth });
  const drive = google.drive({ version: "v3", auth });
  const folderResponse = await drive.files.list({
    q: "name='Brigid' and mimeType='application/vnd.google-apps.folder'",
    fields: "files(id)",
  });
  const folderId = folderResponse.data.files[0].id;
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/'`,
    fields: "files(id, name, mimeType)",
  });

  // ✅ Generate Secure Proxy URLs (Served via Express)
  const files = response.data.files.map((file) => `${API_URL}/images/image/${file.id}/${email}`); // ✅ Proxy URL
  console.log(files)
  return files
}

export const getAllImages = async (req, res) => {
  const decoded = jwtDecode(req.headers.authorization.replace('Bearer ', ''));
  const email = decoded.email;
  const user = await User.findOne({ email });
  auth.setCredentials({ refresh_token: user.refreshToken });
  google.options({ auth });
  const drive = google.drive({ version: "v3", auth });

  try {
    // Find "Brigid" folder
    const folderResponse = await drive.files.list({
      q: "name='Brigid' and mimeType='application/vnd.google-apps.folder'",
      fields: "files(id)",
    });

    if (!folderResponse.data.files.length) {
      const files = await getBackUpImages()
      res.json({ images: files });
      return
    }

    const folderId = folderResponse.data.files[0].id;

    // Get images inside "Brigid" folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/'`,
      fields: "files(id, name, mimeType)",
    });
    // ✅ Generate Secure Proxy URLs (Served via Express)
    const files = response.data.files.map((file) => `${API_URL}/images/image/${file.id}/${email}`); // ✅ Proxy URL
    console.log(files)
    res.json({ images: files });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to retrieve images" });
  }
}

export const getImage = async (req, res) => {
  const email = req.params.email;
  const user = await User.findOne({ email });
  auth.setCredentials({ refresh_token: user.refreshToken });
  const drive = google.drive({ version: "v3", auth });
  try {
    const fileId = req.params.fileId;

    // ✅ Fetch the image from Google Drive
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );
    res.setHeader("Content-Type", "image/jpeg");
    response.data.pipe(res); // ✅ Stream image directly
  } catch (error) {
    console.error("🚨 Error fetching image:", error);
    res.status(500).json({ error: "Failed to retrieve image" });
  }
}
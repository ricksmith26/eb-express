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
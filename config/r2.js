const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

require("dotenv").config();

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.ENDPOINTCLOUDFLARE,
  credentials: {
    accessKeyId: process.env.ACCESSKEYIDCLOUDFLARE,
    secretAccessKey: process.env.SECRETACCESSKEYCLOUDFLARE,
  },
});

/* ================= SUBIR ARCHIVO ================= */

const uploadToR2 = async ({ buffer, mimetype, folder, filename }) => {
  const key = `${folder}/${Date.now()}-${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
};

/* ================= BORRAR ARCHIVO ================= */

const deleteFromR2 = async (fileUrl) => {
  if (!fileUrl) return;

  // Extraer el key desde la URL pública
  const key = fileUrl.split(`${process.env.R2_PUBLIC_URL}/`)[1];

  if (!key) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    })
  );
};

module.exports = {
  s3,
  uploadToR2,
  deleteFromR2,
};
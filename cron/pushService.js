const { Expo } = require('expo-server-sdk');
let expo = new Expo();

const sendPushNotification = async (token, body) => {
  if (!Expo.isExpoPushToken(token)){
    return;
  }

  const messages = [{
    to: token,
    sound: 'default',
    title: '⚽ Partido próximo',
    body
  }];

  try {
    await expo.sendPushNotificationsAsync(messages);
    console.log("mensaje enviado")
  } catch (error) {
    console.error('❌ Error al enviar notificación:', error);
  }
};

module.exports = { sendPushNotification };
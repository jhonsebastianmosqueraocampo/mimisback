const mongoose = require("mongoose");

const conection = async () => {
  try {
    const uri = 'mongodb://127.0.0.1:27017/mimis';
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };
    await mongoose.connect(uri, options);
    console.log('Conectado a la base de datos');
  } catch (error) {
    console.log(error);
    throw new Error('No se ha establecido la conexión');
  }
};


module.exports = {
    conection
}
const { Router } = require("express");
const multer = require('multer')

const router = Router();

const storeController = require("../controllers/store.js");
const middleware = require("../middlewares/auth");

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG, WEBP images are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 4 * 1024 * 1024 },
});

//checkear role del usuario 
router.get('/checkUserRole', middleware.auth, storeController.checkUserRole)

//obtener usuarios de las tiendas
router.get('/getStores', middleware.auth, storeController.getStores)

//crear usuario administrador
router.post('/createAdmin', storeController.createAdmin)

//generar codigo tienda nueva
router.post('/generateStoreCode', middleware.auth, storeController.generateCode);

//registro inicial del dueño del comercio
router.post("/completeRegistration", upload.single("companyLogo"), storeController.completeStoreUserRegistration);

//registrar tienda
router.post('/registerStore', middleware.auth, upload.single("imagen"), storeController.registerStore);

//editar tienda
router.put('/store/:storeId', middleware.auth, upload.single("image"), storeController.updateStore);

//Editar tienda
router.put('/editStore', middleware.auth, upload.single("imagen"), storeController.editStore);

//login tienda
router.post('/login', storeController.login);

//obtener productos tienda paginado
router.get('/products/:page', middleware.auth, storeController.productsList);

//productos del owner
router.get('/productsOwner', middleware.auth, storeController.productsOwner);

//obtener productos tienda por categoria paginado
router.get('/productsByCategory/:category/:page', middleware.auth, storeController.productsByCategory);

//obtener productos por tienda paginado
router.get('/productsByStore/:storeId/:page', middleware.auth, storeController.productsByStore);

//eliminar producto tienda
router.delete('/product/:productId', middleware.auth, storeController.deleteProduct);

//crear un nuevo producto
router.post("/product", middleware.auth, upload.any(), storeController.createProduct);

//editar producto tienda
router.put('/product/:productId', middleware.auth, upload.any(), storeController.updateProduct);

//eliminar tienda
router.delete('/store/:storeId', middleware.auth, storeController.deleteStore);

//obtener las ordenes de pedidos de una tienda
router.get('/productsOrders/:storeId', middleware.auth, storeController.productsOrders);

//obtener las ordenes de pedidos de un owner
router.get('/productsOwnerOrders', middleware.auth, storeController.productsOwnerOrders);

//obtener el detalle de una orden
router.get('/orderDetail/:orderId', middleware.auth, storeController.orderDetail);

//crear un nuevo pedido
router.post('/createOrder', middleware.auth, storeController.createOrders); //cada orden tendrá el id del store correspondiente

//actualizar el estado del pedido
router.put('/order/status/:orderId', middleware.auth, storeController.updateOrderStatus);

//obtener pedidos de un usuario
router.get('/userOrders', middleware.auth, storeController.userOrders);

//eliminar pedido
router.delete('/order', middleware.auth, storeController.deleteOrder);

//obtener tiendas del owner
router.get('/storesOwner', middleware.auth, storeController.storesOwner)

//obtener el perfil del storeuser
router.get('/profile', middleware.auth, storeController.profile)

//editar perfil storeuser
router.put('/profile', middleware.auth, storeController.editProfile)

router.get('/getOrders', middleware.auth, storeController.getOrders)
router.get('/getInvoices', middleware.auth, storeController.getInvoices)

module.exports = router;
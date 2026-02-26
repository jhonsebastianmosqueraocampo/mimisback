const jwts = require("jwt-simple");
const moment = require("moment");
require("dotenv").config();

const ACCESS_SECRET = process.env.ACCESS_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

const generateAccessToken = (user) => {
    const payload = {
        id: user._id,
        nickName: user.nickName,
        iat: moment().unix(),
        exp: moment().add(120, "minutes").unix()
    }

    return jwts.encode(payload, ACCESS_SECRET);
}

const generateRefreshToken = (user) => {
    const payload = {
        id: user._id,
        nickName: user.nickName,
        iat: moment().unix(),
        exp: moment().add(7, "days").unix()
    }

    return jwts.encode(payload, REFRESH_SECRET);
}


const refresh = (token) => {
    payload = jwts.decode(token, REFRESH_SECRET);
    return payload
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    refresh
}
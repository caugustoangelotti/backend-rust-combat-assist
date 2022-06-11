'use strict';

module.exports = class Player{
    constructor(steamId, name, x = 0, y = 0, isOnline = false){
        this.steamId = steamId,
        this.name = name,
        this.x = x,
        this.y = y,
        this.isOnline = isOnline
    }
}
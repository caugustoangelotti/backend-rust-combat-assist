'use strict';

module.exports = class Alarm{
    constructor(alarmId, x = 0, y = 0, state = false){
        this.alarmId = alarmId,
        this.x = x,
        this.y = y,
        this.state = state
    }
}
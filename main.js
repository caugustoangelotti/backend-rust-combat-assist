"use strict";
require('dotenv').config();
const RustPlus = require('@liamcottle/rustplus.js');
const ws = require('ws');
const fs = require('fs');
var Position = require("./Models/Position.js")
var Player = require("./Models/Player.js")
var Alarm = require("./Models/Alarm.js")
const axios = require('axios').default;
var alarmList = require("./alarms.json");
var playersPosData = {};
var changed = true;
var lastPlayerPos = new Position(-1,-1);

function getMapImage(){
    rustplus.getMap((message) => {
        fs.writeFileSync('map.jpg', message.response.map.jpgImage);
        rustplus.disconnect();
    });
}

function persistAlarmsToFile(list){
    const data = JSON.stringify(list);
    console.log("Persisting alarms to file!");
    fs.writeFile('alarms.json', data, (err) =>{
        if(err){
            throw err;
        }
        console.log("Alarmes salvos com sucesso");
    });
}

function registerAlarms(alarms){
    Object.keys(alarms).forEach(id => {
        rustplus.getEntityInfo(id, () => {
            return true;
        });
    });
}

function postAlarmsListToMaster(data){
    axios.post(process.env.ALARM_LIST_ENDPOINT, data)
      .then(function (response) {
        console.log("Lista de alarmes atualizada no master http status: %s",response.status);
      })
      .catch(function (error) {
        console.log(error);
      });
}

function sendPlayersPositionsToMaster(){
    geoLocationSocket.send(JSON.stringify(Object.values(playersPosData)));
}

function updatePlayerPosition(steamId, playerData){
    let playerId = BigInt(steamId).toString();
    playersPosData[playerId] = new Player(playerId, playerData.name, playerData.x, 
                                    playerData.y, playerData.isOnline);
}

function getPlayerDataBySteamId(steamId){
    if(!(steamId in playersPosData)){
        return false;
    }
    return playersPosData[steamId];
}

function removeAlarmFromList(alarmId){
    if(!(alarmId in alarmList)){
        return false;
    }
    delete alarmList[alarmId];
    return true;
}

const geoLocationSocket = new ws(`ws://localhost:${process.env.COMBAT_ASSIST_PORT}/geolocation?send=true`);
const alarmsSocket = new ws(`ws://localhost:${process.env.COMBAT_ASSIST_PORT}/alarms?send=true`);
var rustplus = new RustPlus(process.env.RUST_SERVER_IP, process.env.RUST_APP_PORT,
                            process.env.STEAM_ID, process.env.APP_KEY);

geoLocationSocket.on('open', () => {
    console.log("geolocationListener: connected and sending data!");
});

alarmsSocket.on("open", () =>{
    console.log("alarmListener: connected and sending data!");
});

geoLocationSocket.on('close', () => {
    console.log("geolocationListener: closed connection!");
});

alarmsSocket.on("close", () =>{
    console.log("alarmListener: closed connection!");
});

rustplus.on('connected', () => {
    registerAlarms(alarmList);
    
    setInterval(function(){
        rustplus.getTeamInfo((message) => {
            let players = message.response.teamInfo.members;
            players.forEach(p => {
                let currentPlayerPos = new Position(p.x, p.y);
                if(JSON.stringify(currentPlayerPos) != JSON.stringify(lastPlayerPos)){
                    updatePlayerPosition(p.steamId, p);
                    lastPlayerPos = currentPlayerPos;
                    changed = true;
                }
            });
            if(changed){
                sendPlayersPositionsToMaster();
                changed = false;
            }
            return true;
        });
    }, 1000);

    rustplus.on('message', (message) => {
        if(message.broadcast.teamMessage){
            let commonObjectPath = message.broadcast.teamMessage.message;
            let playerMessage = commonObjectPath.message;
            if(playerMessage.startsWith("#")){
                let playerCommand = playerMessage.substring(1);
                const command = playerCommand.split(" ");
                let chatCommand = command[0];
                let alarmId = command[1];
                if(chatCommand.toLowerCase() == "add" || chatCommand.toLowerCase() == "a"){
                    let playerSteamId = BigInt(commonObjectPath.steamId).toString();
                    let playerData = getPlayerDataBySteamId(playerSteamId);
                    if(playerData){
                        if(alarmId){
                            let alarm = new Alarm(alarmId, playerData.x, playerData.y, false);
                            alarmList[alarmId] = alarm;
                            console.log("alarme %s adicionado com sucesso", alarmId);
                        }
                    }else{
                        console.log("cht-cmd-err: Erro ao obter informacoes do jogador");
                    }
                }else if (chatCommand.toLowerCase() == "save" || chatCommand.toLowerCase() == "s"){
                    console.log("Listening all sensors states!!!");
                    persistAlarmsToFile(alarmList);
                    postAlarmsListToMaster(alarmList);
                    registerAlarms(alarmList);
                }else if (chatCommand.toLowerCase() == "remove" ||chatCommand.toLowerCase() == "r"){
                    if(removeAlarmFromList(alarmId)){
                        persistAlarmsToFile(alarmList);
                        postAlarmsListToMaster(alarmList);
                    }
                }else{
                    console.log("cht-cmd-err: Comando nao encontrado!!!");
                }
            }
        }

        if(message.broadcast && message.broadcast.entityChanged){

            var entityChanged = message.broadcast.entityChanged;
        
            var alarmEntityId = entityChanged.entityId;
            var alarmState = entityChanged.payload.value;
            if(alarmEntityId in alarmList)
            {
                alarmList[alarmEntityId].state = alarmState;
                alarmsSocket.send(JSON.stringify(alarmList[alarmEntityId]));
            }
    
        }
    });
});

rustplus.connect();
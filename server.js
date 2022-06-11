'use strict';
require('dotenv').config();
var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);
var alarmList = require("./alarms.json");
const fs = require('fs');
var cors = require('cors')
const bodyParser = require('body-parser');
var corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var geoLocationSubscribers = {};
var alarmSubscribers = {};

expressWs.getUniqueID = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4();
};

function broadcastForSubscribers(msg, subscribers){
    for(let socketId in subscribers){
        subscribers[socketId].send(msg.data);
    }
}

function isSender(url){
    const params = url.split("?");
    if(params[1] == "send=true"){
        return true;
    }
    return false;
}

function createNewAlarmsList(list){
    const data = JSON.stringify(list);
    console.log("Persisting alarms to file!");
    fs.writeFile('alarms.json', data, (err) =>{
        if(err){
            throw err;
        }
    });

}

app.get('/alarms-list', cors(corsOptions), function(req, res) {
    res.json(alarmList);
});

app.post('/alarms-list', cors(corsOptions), function(req, res) {
    alarmList = req.body;
    //console.log(req.body);
    res.sendStatus(200);
});

app.delete('/alarms-list', cors(corsOptions), function(req, res) {
    alarmList = {};
    createNewAlarmsList(alarmList);
    res.sendStatus(200);
});


app.ws('/geolocation', function(ws, req) {
    ws.id = expressWs.getUniqueID();
    
    if(!isSender(req.url)){
        geoLocationSubscribers[ws.id] = ws;
        console.log("%s: connected and listening for geo locations", ws.id);
    }else{
        console.log("%s: connected and sending geo location data", ws.id);
    }

    ws.onmessage = function(msg) {
        broadcastForSubscribers(msg, geoLocationSubscribers);
    };
    ws.onclose = function(){
        if(geoLocationSubscribers.hasOwnProperty(ws.id)){
            console.log("%s: closed connection", ws.id);
            delete geoLocationSubscribers[ws.id];
        }
    }
});

app.ws('/alarms', function(ws, req) {
    ws.id = expressWs.getUniqueID();

    if(!isSender(req.url)){
        alarmSubscribers[ws.id] = ws;
        console.log("%s: connected and listening for alarms", ws.id);
    }else{
        console.log("%s: connected and sending alarm data", ws.id);
    }

    ws.onmessage = function(msg) {
        broadcastForSubscribers(msg, alarmSubscribers);
    };
    
    ws.onclose = function(){
        if(alarmSubscribers.hasOwnProperty(ws.id)){
            console.log("%s: closed connection", ws.id);
            delete alarmSubscribers[ws.id];
        }
    }
});

app.listen(process.env.COMBAT_ASSIST_PORT);
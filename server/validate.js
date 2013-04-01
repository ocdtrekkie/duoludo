assert = require('assert');
async = require('async');
database = require('./database');

//var mongo = require('mongodb');
//var BSON = mongo.BSONNative;
//var ObjectId = BSON.ObjectID.createFromHexString;
var ObjectId = require('mongodb').ObjectID
game = require('../client/zepto/zepto').game;


function validatePath (path) {

    game.load(path.startState);

    // copy and reverse |events|
    var events = path.events.slice().reverse();
    var ticks = path.startTicks;


    // mimic the control flow in replayMode.tick
    var stop = false;
    while (! stop) {

        var stampedEvent = events[events.length - 1];
        while((!stop) && stampedEvent && (stampedEvent.t <= ticks) &&
              (events.length > 0)) {
            stampedEvent = events.pop();
            var event = stampedEvent.e;
            switch (event.type) {
            case "keydown":
                game.kdown(event);
                break;
            case "keyup":
                game.kup(event);
                break;
            case "gameover":
            case "abort":
            case "checkpoint":
                stop = true;
                break;

            }
            stampedEvent = events[events.length - 1];
        }

//        if (!stop) {
            game.tick();
            ++ticks;
//        }
    }

    return ( game.stateequals(game.getstate(), path.endState) &&
             game.atcheckpoint() == path.endCheckpoint );
}


// if path.prev is not an ObjectId or 'start', then make it the
// appropriate ObjectId.
function updatePrev (path, db) {
  return function (callback) {
    var id = path._id;
    if (path.prev == 'start') {
        return callback(null, {});
    } else if (! path.prev.hasOwnProperty('sessionID')) {
        return callback(null, {});
    }

    // if we are here, path.prev must be a record with a session ID and a pathID
    var sessionID = path.prev.sessionID;
    var pathID = path.prev.pathID;

    console.log("looking for: " + sessionID + " " + pathID);
      console.log(path.prev.toString());

    db.collection('paths', function(err, collection) {
        if(err) {return callback(err,null); };
        collection.findOne({'key.sessionID': sessionID, 'key.pathID': pathID}, function (err, doc) {
            if(err) {return callback(err,null); };
            var prevID = doc._id;
            console.log('found the previous: ' + prevID);
            collection.update({_id: id}, {$set : {prev : prevID.toString()}}, {w:1}, callback);
        });
    });
  };
}

function updateValidity (path, db) {
    return function (callback) {
        if (path.hasOwnProperty('valid')) {
            return callback(null, {});
        }
        var validity = validatePath(path);
        console.log('updating validity to ' + validity);
        var id = path._id;
        db.collection('paths', function(err, collection) {
            if(err) {return callback(err,null); };
            assert.equal(err, null);
            collection.update({_id : id}, {$set : {valid : validity}}, {w:1, upsert:true}, callback);
        });
    };
}

function updateCumulativeValidity (path, db) {
  return function (callback) {
    if (!path.hasOwnProperty('valid')) {
        return callback(null, {});
    }

    console.log('updating cumulative validity');
    if (path.prev == 'start') {
        db.collection('paths', function(err, collection) {
            if(err) {return callback(null, {});}
            collection.update({_id : path._id}, {$set : {validFromStart : path.valid}}, {w:1, upsert:true}, callback);
        });
    } else if (path.prev.hasOwnProperty('sessionID')) {
        // wait until it has an index there
        return callback(null, {});
    } else {
        // if we are here, we know that path.prev is an ObjectId.
        db.collection('paths', function(err, collection) {
            if(err) {return callback(err,null);}
            collection.findOne({_id : ObjectId(path.prev)}, function (err, prevPath) {
                if(err) {return callback(err,null);}
                if (!prevPath.hasOwnProperty('validFromStart') ) {
                    console.log('not saturated yet');
                    return callback(null, {});
                }
                console.log('prev vfs: ' + prevPath.validFromStart);
                var validFromStart =  (path.valid && prevPath.validFromStart);
                collection.update({_id : path._id}, {$set : {validFromStart : validFromStart}}, {w:1, upsert:true}, callback);
            });
        });
    }
  };

}

function doValidation (callback) {
    console.log('hello world');

    database.connect (function (db) {
        db.collection('paths', function(err, collection) {
            if(err) {return callback(err,null);}

            // records that have the 'validFromStartField' are already done being processed.
            collection.find({validFromStart : {$exists : false}}).toArray( function(err, docs) {
                console.log('working to validate this many: ' + docs.length);
                var fns1 = docs.map(function (path) {return updatePrev(path, db);});
                var fns2 = docs.map(function (path) {return updateValidity (path, db);});
                var fns3 = docs.map(function (path) {return updateCumulativeValidity(path, db);});
                async.series(fns1.concat(fns2.concat(fns3)), function (err, results) {
                    db.close();
                    return callback(err,results);
                });
            });
        });
    });

}

function doAllValidation () {
    doValidation (function (err, results) {
        if (err) {
            console.log('Error!');
            console.dir(err);
            return;
        } else if (results.length == 0) {
            console.log('done');
            return;
        } else {
            console.log('more to do');
            doAllValidation();
        }
    });
}


//doValidation();

// do it every ten seconds
setInterval(doAllValidation, 10000);
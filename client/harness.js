var game = zepto

var stdout;

function StampedEvent (ticks, event) {
    this.t = ticks;
    this.e = event;
};

function recordizeEvent(event) {
    return {"type": event.type,
            "keyCode": event.keyCode
           };
};


var pathlist = {
    add : function (path) {
        var div = document.createElement('div');
        var input = document.createElement('input');
        input.setAttribute('type', 'radio');
        input.setAttribute('name', 'path');
        input.setAttribute('pathID', path.pathID);
        input.setAttribute('onclick','game.load(mainMode.lookupPath(getAttribute(\'pathID\')).endState);game.render();');
        if (path.endCheckpoint != "gameover") {
            input.setAttribute('checked', 'true');
        }
        var label = document.createElement('label');
        label.innerHTML = path.pathID + ': ' + path.username + ' ' + (new Date(path.startTime)).toUTCString();
        div.appendChild(input);
        div.appendChild(label);

        var closebutton = document.createElement('button');
        closebutton.innerHTML = '&times;';
        div.appendChild(closebutton);

        $('#pathlist').append(div);


        var req = new XMLHttpRequest();
        req.open("POST", "index.html", true);
        req.setRequestHeader("Content-Type", "text/plain;charset=UTF-8");
        req.send(JSON.stringify(path));
    },

    findSelected : function() {
        return $('[name="path"]:checked').attr('pathID');
    },

    hide : function() {
        $('#pathlist').css('display','none');
    },

    show : function() {
        $('#pathlist').show();
    }
};

var replayMode = {
    start : function (path) {
        pathlist.hide()
        // copy and reverse |events|
        this.events = path.events.slice().reverse();
        stdout.innerHTML = "REPLAY";
        game.load(path.startState);
        game.start()
        $(window).off('keyup keydown');
        $(window).keydown(this.kdown.bind(this));
        this.ticks = 0;
        this.ticker = window.setInterval(this.tick.bind(this), game.tickMillis);
    },

   stop : function () {
        clearInterval(this.ticker);
        pathlist.show();
        game.stop();
        mainMode.menu();
    },

    tick : function () {
        var stampedEvent = this.events[this.events.length - 1];
        while(stampedEvent && (stampedEvent.t <= this.ticks) &&
              (this.events.length > 0)) {
            stampedEvent = this.events.pop();
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
                this.stop();
            }
            stampedEvent = this.events[this.events.length - 1];
        }

        game.tick();
        game.render();
        ++this.ticks;
    },

    kdown : function (event) {
        if (event.keyCode == 27) { // ESC
            this.stop()
        }
    }
};


var mainMode = {
    paths : Array(),

    lookupPath : function(pathID) {
        for (var ii = 0; ii < this.paths.length; ++ii) {
            if (this.paths[ii].pathID == pathID) {
                return this.paths[ii];
            }
        }
        return null;
    },

    kdown : function(event) {
        if (event.keyCode == 13) { // ENTER
            var selected = pathlist.findSelected();
            if (selected) {
                playMode.start(this.lookupPath(selected.valueOf()).endState);
            } else {
                playMode.start();
            }
        } else if (event.keyCode == 82 /* 'r' */ ) {
            var selected = pathlist.findSelected();
            if (selected) {
                replayMode.start(this.lookupPath(selected.valueOf()));
            }
        }
    },

    menu : function () {
        stdout.innerHTML = "MAIN MENU. PRESS ENTER TO PLAY";
        $(window).off('keydown keyup');
        $(window).keydown(this.kdown.bind(this));
    },

    registerPath : function (path) {
        this.paths.push(path);
        pathlist.add(path);
    }
};

var playMode = {

    lastPathID : 0,
    getPathID: function () {
        ++this.lastPathID;
        return this.lastPathID;
    },

    // startState is optional.
    start : function (startState) {
        pathlist.hide();
        stdout.innerHTML = "YOU ARE NOW PLAYING";

        this.checkpointbox = document.getElementById('checkpointmode'),

        game.load(startState);
        game.start();
        $(window).off('keyup keydown');
        $(window).keyup(this.kup.bind(this));
        $(window).keydown(this.kdown.bind(this));

        var username = $('#username').attr('value');

        this.path = {username : username,
                     startTime:  Date.now(), // milliseconds since the dawn of time
                     startState: game.getstate()};

        cp = game.atcheckpoint();
        if (cp) {
            this.path.startCheckpoint = cp;
        } else {
            this.path.startCheckpoint = "start";
        }

        this.ticks = 0;
        this.events = Array();
        this.ticker = window.setInterval(this.tick.bind(this), game.tickMillis);
    },

    stop : function (endCheckpoint) {
        clearInterval(this.ticker);
        pathlist.show();
        game.prestop();
        game.stop();
        this.path.endCheckpoint = endCheckpoint;
        this.path.events = this.events;
        this.path.endState = game.getstate();
        this.path.pathID = this.getPathID();
        mainMode.registerPath(this.path);
        mainMode.menu();
    },

    tick : function () {
        game.tick();
        game.render();
        if (game.isgameover()) {
            stdout.innerHTML = "you're dead";
            this.events.push(new StampedEvent(this.ticks, {'type':'gameover'}));
            this.stop("gameover");
        }
        cp = game.atcheckpoint();
        if (cp) {
            console.log("at checkpoint: " + cp);
            if (this.checkpointbox.checked &&
                cp != this.path.startCheckpoint ) {
                this.events.push(new StampedEvent(this.ticks, {'type':'checkpoint'}));
                this.stop(cp);
            }
        }

        ++this.ticks;
    },

    kup : function (event) {
        var revent = recordizeEvent(event);
        this.events.push(new StampedEvent(this.ticks, revent));
        game.kup(revent);
    },

    kdown : function(event) {
        if (event.keyCode == 27) { // ESC
            this.events.push(new StampedEvent(this.ticks, {'type':'abort'}));
            this.stop('abort')
        }

        var revent = recordizeEvent(event);
        this.events.push(new StampedEvent(this.ticks, revent));
        game.kdown(revent);
    },

};


function init() {
    stdout = document.getElementById('stdout');
    gameDiv = document.getElementById('game')

    game.init(gameDiv);
    stdout.innerHTML = "Enter your username to begin.";
    document.getElementById('usernamebutton').focus();
};


function gotusername() {
    var username = $('#usernameinput').val();
    $('#username').html('username: ' + username).attr('value', username);
    mainMode.menu();
}
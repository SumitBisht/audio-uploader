/**
 * Contains the javascript for usermedia page
 * also performs manipulation on the generated contents on the browser.
 */

var startRecording = document.getElementById('start-recording');
var stopRecording = document.getElementById('stop-recording');
var startRecordingAudio = document.getElementById('start-recording-audio');
var stopRecordingAudio = document.getElementById('stop-recording-audio');
var cameraPreview = document.getElementById('camera-preview');
var writingStatus = document.getElementById('firstrecord');
var waitArea = document.getElementById('wait');
var storedPreviews = {}, storedAudio = {};
//var server = 'https://localhost:8443/';
var server = 'http://localhost:8888/';
/* Connects to server via sockets */
console.log('connecting');
var socket = io.connect(server);

var audio = document.querySelector('audio');

var isFirefox = !! navigator.mozGetUserMedia;

var recordAudio, recordVideo;
var recAudio;

sampleVideoStream = function() {
    navigator.getUserMedia({
        audio: true,
        video: true
    }, function(stream) {
        cameraPreview.src = window.URL.createObjectURL(stream);
        cameraPreview.play();
    }, function(error) {
        console.error("Unable to preview video: check your settings, maybe.");
    });
}

if (startRecording != null)
    startRecording.onclick = function() {
        startRecording.disabled = true;
        stopRecording.disabled = false;
        navigator.getUserMedia({
            audio: true,
            video: true
        }, function(stream) {
            cameraPreview.src = window.URL.createObjectURL(stream);
            cameraPreview.play();

            recordAudio = RecordRTC(stream, {
                bufferSize: 16384
            });

            if (!isFirefox) {
                recordVideo = RecordRTC(stream, {
                    type: 'video'
                });
            }

            recordAudio.startRecording();

            if (!isFirefox) {
                recordVideo.startRecording();
            }

        }, function(error) {
            alert(JSON.stringify(error));
        });
    };
if (stopRecording != null)
    stopRecording.onclick = function() {
        startRecording.disabled = false;
        stopRecording.disabled = true;

        recordAudio.stopRecording(function() {
            if (isFirefox) onStopRecording(true);
        });

        if (!isFirefox) {
            recordVideo.stopRecording();
            onStopRecording(false);
        }

        function onStopRecording(onlyAudio) {
            recordAudio.getDataURL(function(audioDataURL) {
                if (!onlyAudio) {
                    recordVideo.getDataURL(function(videoDataURL) {
                        captureStreams(audioDataURL, videoDataURL);
                    });
                } else captureStreams(audioDataURL);
            });
        }
    };

/**
 * the recorders for storing audio
 */
if (startRecordingAudio != null)
    startRecordingAudio.onclick = function() {
        stopRecordingAudio.disabled = false;
        startRecordingAudio.disabled = true;
        navigator.getUserMedia({
            audio: true,
            video: false
        }, function(stream) {
            recAudio = RecordRTC(stream, {
                bufferSize: 16384
            });
            recAudio.startRecording();
            waitArea.innerHTML = '<p>Recording Audio</p>';
        }, function(error) {
            alert(JSON.stringify(error));
        });
    };
if (stopRecordingAudio != null)
    stopRecordingAudio.onclick = function() {
        waitArea.innerHTML = '<img src="ajax-loader.gif" alt="loading" />';
        //Added a time delay to ensure the last few moments of recording do not get truncated
        setTimeout(function() {
            stopRecordingAudio.disabled = true;
            startRecordingAudio.disabled = false;
            // document.getElementById('result_audio').innerHTML  = '';
            recAudio.stopRecording(function() {
                onStopRecordingAudio();
            });
        }, 2500);

        function onStopRecordingAudio() {
            recAudio.getDataURL(function(audioDataURL) {
                var audioFile = {};
                var fileName = getDateString();

                console.log('Audio captured: ' + JSON.stringify(audioDataURL));

                audioFile = {
                    name: fileName + (isFirefox ? '.ogg' : '.wav'),
                    contents: audioDataURL
                };
                storedAudio[audioFile.name] = false;
                console.log('saving audio');
                socket.emit('save-audio', audioFile);
                // if (document.getElementById("DirectUpload") != null) {
                //     reGenerateAudioPreviewTable();
                // }
            });
        }
    }
    /**
     * Captures the streams into the session storage on the client end.
     * The interface allows the user to preview the raw video first before
     * uploading and merging the video on the server end.
     */

function captureStreams(audioDataURL, videoDataURL) {
    var fileName;

    fileName = getRandomString();
    if (writingStatus != null && writingStatus.innerHTML == 'Please greet the system first by giving a brief recording.') {
        fileName = 'previewVideo-' + fileName;
        console.log('This is a preview recording');
    }
    var files = {};

    files.audio = {
        name: fileName + (isFirefox ? '.ogg' : '.wav'),
        type: isFirefox ? 'audio/ogg' : 'audio/wav',
        contents: audioDataURL
    };

    if (!isFirefox) {
        files.video = {
            name: fileName + '.webm',
            type: 'video/webm',
            contents: videoDataURL
        };
    }

    files.isFirefox = isFirefox;
    cameraPreview.src = '';
    waitArea.innerHTML = '<img src="ajax-loader.gif" alt="loading" />';

    xhr('uploads/', files, function(_fileName) {
        console.log('Uploading the generated files to server.');
        var href = location.href.substr(0, location.href.lastIndexOf('/') + 1);
        cameraPreview.src = href + 'uploads/' + _fileName;
        cameraPreview.play();
    });
}

function xhr(url, data, callback) {
    console.log('XHR with callback as: ');
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
        if (request.readyState == 4 && request.status == 200) {
            console.log('Calling a request with ' + request);
            callback(request.responseText);
        }
    };

    var options = {};

    var module = {
        files: [data.audio.name, data.video.name],
        print: print,
        printErr: print
    };

    var files = {};
    files.name = data.video.name;
    files.audio = data.audio.contents;
    files.video = data.video.contents;
    sendFiles(files);

}

window.onbeforeunload = function() {
    startRecording.disabled = false;
};

function getRandomString() {
    console.log('Getting a random string to name the files');
    if (window.crypto) {
        var a = window.crypto.getRandomValues(new Uint32Array(3)),
            token = '';
        for (var i = 0, l = a.length; i < l; i++) token += a[i].toString(36);
        return token;
    } else {
        return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '');
    }
}

function getDateString() {
    var dt = new Date();
    var name = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate() + '_' + dt.getHours() + '-' + dt.getMinutes() + '-' + dt.getSeconds();
    return name;
}


function sendFiles(data) {
    socket.emit('merge-file-streams', data);
}

function viewResults(resultData) {
    var resultTable = document.getElementById('preview-table');
    var newRow = resultTable.insertRow(resultTable.rows.length);
    var fileName = newRow.insertCell(0);
    var video = newRow.insertCell(1);

    fileName.innerHTML = '<a href="' + server + resultData + '"">'+resultData+'</a>';
    video.innerHTML = '<video controls> <source src="' + server + resultData + '" type="video/webm" /></video>';
}



socket.on('Preview', function(fileName) {
    console.log(fileName);
    waitArea.innerHTML = '';
    viewResults(fileName);
    // if (fileName.indexOf('previewVideo') != -1) {
    //     writingStatus.innerHTML = 'You may record your wishes now.';
    //     return;
    // }
    // var video_url = document.getElementById('result_video');
    // if (video_url != null) {
    //     video_url.innerHTML += '<video controls> <source src="' + server + fileName + '" type="video/webm" /></video>';
    // }
});

socket.on('uploaded-audio', function(name) {
    if (waitArea == null) {
        console.log('Uploaded on server');
        document.getElementById('result_audio').innerHTML += '<audio controls source src="' + server + 'uploads/' + name + '" >Not Supported</audio> <br />';
    } else {
        waitArea.innerHTML = '';
        storedAudio[name] = true;
        document.getElementById('result_audio').innerHTML += '<audio controls source src="' + server + 'uploads/' + name + '" >Not Supported</audio> <br />';
        reGenerateAudioPreviewTable();
    }
});

function reGenerateAudioPreviewTable(){
    // var resultTable = document.getElementById('audio-previews');
    // var newRow = resultTable.insertRow(resultTable.rows.length);
    // var fileName = newRow.insertCell(0);
    // var video = newRow.insertCell(1);

    // fileName.innerHTML = '<a href="' + server + resultData + '"">'+resultData+'</a>';
    // video.innerHTML = '<video controls> <source src="' + server + resultData + '" type="video/webm" /></video>';
}
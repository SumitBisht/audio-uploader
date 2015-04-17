var fs = require('fs'),
    path = require('path'),
    sys = require('sys'),
    express = require('express'),
    app = express(),
    //exec = require('child_process').exec,
    Fiber = require('fibers'),
    //Q = require("q"),
    config = require('./config'),
    http = require('http').createServer(app).listen(config.HTTP_PORT);


app.set('view engine', 'jade');
app.locals.basedir = path.join(__dirname, 'views');
app.use(express.logger());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.bodyParser()); //{uploadDir: path.join(__dirname, 'public', 'uploads')} )
app.use(express.urlencoded());


// var https = require('https').createServer(options, app).listen(config.HTTPS_PORT);
var io = require('socket.io').listen(http);
io.set('log level', 1);

app.get('/audio_upload', function(req, res) {
    fs.readFile(path.join( __dirname, 'public', 'audio_upload.html'), 'utf8', function(err, text) {
        res.send(text);
    });
});

app.get('/admin', function(req, res){
    res.render('admin');
});
app.post('/processed', function(req, res){
    var pageName = req.body.page_name;
    var audioFile = req.body.file;
    console.log('page name: '+pageName+' and file: '+audioFile);
    res.redirect('/admin?name='+pageName+'&file='+audioFile);//,{ entered:req.body.page_name})
});

app.get('/uploads', function(req, res) {
    var file_names = [];
    var files = fs.readdirSync(path.join(__dirname, 'public', 'uploads'));
    files.map(function(file) {
        file_names.push(file);
    });
    res.render('list', {
        files: file_names
    });
});
// app.get('/*', function(req, res){
//     res.send('it is working');
// });


/**
 * In the new apporach, since the processing is performed on the client side itself,
 * the work to merge and encode the files is not required on the server end
 */
io.sockets.on('connection', function(socket) {
    socket.on('send-file', function(name, buffer) {
        //Make the filename more system friendly.
        name = name.substr(name.lastIndexOf('/') + 1).trim();
        //Save the file name depending upon the type of the file received.
        switch (buffer.type) {
            case "gif":
                name = name + '.gif';
                break;
            case "audio":
                name = name + '.wav';
                break;
            case "video":
                name = name + '.webm';
                break;
            default:
                return;
        }
        var fullPath = path.join(__dirname, 'public', 'uploads', name);
        console.log('filename: ' + fullPath);
        fs.exists(fullPath, function(exists) {
            if (exists) {
                console.log('File already exists on server.');
                return;
            }
        });

        var blob = buffer.Blob;

        var contents = blob.substring(blob.lastIndexOf(','));

        // Decode the information
        var decoded = new Buffer(contents, 'base64');
        //Write the file containing the decoded infromation
        fs.writeFile(fullPath, blob, function(error) {
            if (error)
                console.log('Received the error as: ' + error);
            else {
                console.log('file written');
                socket.emit('File-Save', name);
            }
        });
    });

    /**
     * Simply saves the audio file on the server and uploads
     */
    socket.on('save-audio', function(audioFile) {
        Fiber(function() {
            // Convert the .ogg file coming from firefox into wav first
            var extensionIndex = audioFile.name.indexOf('ogg');

            writeToDisk(audioFile.contents, audioFile.name);
            if (extensionIndex != -1) {
                // convertAudioFile(audioFile.name, 'ogg', 'wav');
                // audioFile.name = audioFile.name.substring(0, extensionIndex) + 'wav';
            }
            // else{

            // }
            sleep(1000);
            socket.emit('uploaded-audio', audioFile.name);
        }).run();
    });

    /**
     * The helper method for ensuring that the server running the batch
     * jobs pause for a given time to allowe earlier job to complete.
     */
    function sleep(ms) {
        var fiber = Fiber.current;
        setTimeout(function() {
            fiber.run();
        }, ms);
        Fiber.yield();
    }

    socket.on('delete-audio', function(file) {
        // Delete file from disk
        console.log('Trying to delete file:' + file.name);
        var fileNameWithBase = path.join(__dirname, 'public', 'uploads', file.name);
        fs.unlink(fileNameWithBase, function(err) {
            if (err)
                console.log(err);
            socket.emit('deleted-audio', file);
        })
    });

    socket.on('remove-file', function(file) {
        var actualFile = file.substring(file.indexOf('uploads') + 8);
        console.log('Deleting: ');
        var filePath = path.join(__dirname, 'public', 'uploads', actualFile);
        fs.unlink(filePath);
    });
});



console.log('Server running on ports ' + config.HTTP_PORT + ' & ' + config.HTTPS_PORT);
/**
 * Writes the audio files on to the server
 */
function writeToDisk(dataURL, fileName) {
    console.log('\nTrying to save file: ' + fileName);
    var fileExtension = fileName.split('.').pop(),
        fileRootNameWithBase = path.join(__dirname, 'public', 'uploads', fileName),
        filePath = fileRootNameWithBase,
        fileID = 2,
        fileBuffer;

    if (dataURL == null) {
        console.log('exiting as no data found');
        return;
    }

    while (fs.existsSync(filePath)) {
        filePath = fileRootNameWithBase + '(' + fileID + ').' + fileExtension;
        fileID += 1;
    }

    dataURL = dataURL.split(',').pop();
    fileBuffer = new Buffer(dataURL, 'base64');
    fs.writeFileSync(filePath, fileBuffer);

    console.log('filePath', filePath);
}


function saveDataToFile(blobname, data) {
    var filePath = path.join(__dirname, 'public', 'uploads', blobname);
    var contents = data.substring(data.lastIndexOf(','));
    var decoded = new Buffer(contents, 'base64');

    fs.writeFile(filePath, decoded, function(error) {
        if (error) {
            console.log('Unable to write the file contents to disk due to error: ' + e);
        }
    });
}

/**
 * Returnes the processed file back to client
 */
function returnProcessedFile(socket, targetFileName) {
    console.log('Returning processed file');
    socket.emit('Preview', '/uploads/' + targetFileName);
}

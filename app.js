// get all required items

var MongoClient = require('mongodb').MongoClient
var bodyParser = require('body-parser')
var express = require('express')
var engines = require('consolidate')
var assert = require('assert')
var logger = require('morgan')
var path = require('path')
var favicon = require('serve-favicon')
var cookieSession = require('cookie-session')
var fileUpload = require('express-fileupload')
//var port = process.env.PORT || 1994

var mongoUri = process.env.MONGOLAB_URI ||
     process.env.MONGOHQ_URL ||    
     'mongodb://my381f:1994211@ds125016.mlab.com:25016/my381project'

var ObjectID = require('mongodb').ObjectID

var app = express()
global.userSet = new Set()
global.rootPath = __dirname

app.listen(process.env.PORT || 1994, function () {
        console.log('Server listening on port 1994')
    }  )

app.use(cookieSession({
    name: 'session',
    keys: ['s381f'],
    // Cookie Options
    maxAge: 60*1000*2 // 2 minutes
}))
// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))
app.use(logger('dev'))
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(bodyParser.json({
    limit: '50mb'
}))
app.use(bodyParser.urlencoded({
    limit: '50mb',
    extended: true
}))
app.use(express.static(__dirname + '/public'))




app.use(express.static(path.join(__dirname, 'public')))
app.use(fileUpload({
    limits: {
        fileSize: 50 * 1024 * 1024
    },
}))
// make sure we can connect to database before starting server
MongoClient.connect(mongoUri, function (err, db) {
    global.rt = db.collection('restaurants')
    assert.equal(null, err)
    global.user = db.collection('users')
    console.log('Successfully connected to mongodb')
    const restaurantUrl = '/restaurant'
    const apiUrl = '/api'

    app.get('/', function (req, res) {
        authen(req, res, function () {
            res.redirect(restaurantUrl)
        })
    })

    app.post('/', function (req, res) {
        let username = req.body.username
        let password = req.body.password
        global.user.find({
            username: username
        }).toArray(function (err, loginResult) {
            try {

                if (loginResult.length <= 0) throw ('user not found')
                if (loginResult[0].password != password) throw ('incorrect password')
                req.session.username = username
                global.userSet.add(username)
                res.redirect(req.get('referer'))
            } catch (err) {
                res.send(alertMsg('Fail to login - ' + err))
            }
        })

    })

    app.post('/register', function (req, res) {
        let username = req.body.username
        let password = req.body.password
        let confirm_password = req.body['confirm-password']
        try {
            if (password != confirm_password) throw ('Password not equals to confirm password')
            new Promise(function (resolve, reject) {
                global.user.find({
                    username: username
                }).limit(1).toArray(function (err, data) {
                    resolve(data)
                })
            }).then(function (data) {
                try{
                    if (data.length > 0) throw ('duplicate user')
                    return global.user.insert({
                    username,
                    password
                })
                }catch(err){
                    res.send(alertMsg('Fail to register - ' + err))
                }

                
                
            }).then(function () {
                 res.send('<script>alert("Register Success");window.history.back()</script>')
                
            })
        } catch (err) {
            res.send(alertMsg('Fail to register - ' + err))
        }
    })

    app.get('/logout', function (req, res) {
        
        global.userSet.delete(req.session.username)
        res.clearCookie("session")
        res.clearCookie("session.sig")
        res.redirect('/')
    })

    app.get(restaurantUrl, function (req, res) {
        authen(req, res, function () {
            try {
                global.rt.find({}, {
                    restaurant_id: 1,
                    name: 1
                }).toArray(function (err, data) {
                    res.render('index', {
                        restaurants: data,
                        username: req.session.username
                    })
                })
            } catch (err) {
                res.send('Got error in getAll')
            }
        })

    })

    app.get(restaurantUrl + '/new', function (req, res) {
        authen(req, res, function () {
            res.render('rtForm', {
                restaurant: {
                    name: '',
                    cuisine: '',
                    borough: '',
                    address: {
                        street: '',
                        building: '',
                        zipcode: '',
                        coord: {
                            latitude: '',
                            longtitude: ''
                        }
                    },
                    photo: {},
                },
                type: 'create'
            })
        })
    })

    app.get(restaurantUrl + '/edit/:id', function (req, res) {
        authen(req, res, function () {
            if (req.query.owner != req.session.username) res.send(alertMsg('No Permission'))
            try {
                global.rt.find({
                    _id: new ObjectID(req.params.id)
                }).toArray(function (err, data) {
                    res.render('rtForm', {
                        restaurant: data[0],
                        type: 'edit'
                    })
                })
            } catch (err) {
                res.render('detailRt', {
                    restaurant: {}
                })
            }
        })
    })

    app.post(restaurantUrl + '/edit/:id', function (req, res) {
        authen(req, res, function () {
            let id = req.params.id
            let formData = getFormData(req)
            try {
                const options1 = {
                    _id: new ObjectID(id)
                }
                new Promise(function (resolve, reject) {
                    global.rt.find(options1).limit(1).toArray(function (err, data) {
                        resolve(data)
                    })
                }).then(function (data) {
                    if (data[0].owner != req.session.username) throw ('No Permission')
                    const docToUpdate = Object.assign(data[0], formData)
                    return global.rt.update(options1, docToUpdate, {
                        upsert: true
                    })
                }).then(function () {
                    res.redirect('/restaurant/display/' + id)
                })
            } catch (err) {
                res.send(alertMsg('Failed to edit restaurant- ' + err))
            }
        })
    })

    app.get(restaurantUrl + '/display/:id', function (req, res) {
        authen(req, res, function () {
            try {
                global.rt.find({
                    _id: new ObjectID(req.params.id)
                }).toArray(function (err, data) {
                    res.render('detailRt', {
                        restaurant: data[0]
                    })
                })
            } catch (err) {
                res.render('detailRt', {
                    restaurant: {}
                })
            }
        })
    })

    //api to read
    app.get(apiUrl + restaurantUrl + '/read/:param1/:param2', function (req, res) {
        authen(req, res, function () {
            try {
                var param1 = req.params.param1
                var param2 = req.params.param2
                if ((['name', 'borough', 'cuisine'].indexOf(param1)) < 0) return res.sendStatus(404)
                var options = {
                    [param1]: param2
                }
                global.rt.find(options).toArray(function (err, data) {
                    res.send(data)
                })
            } catch (err) {
                res.send('Got error in getAll')
            }
        })
    })

    app.post(apiUrl + restaurantUrl + '/create', function (req, res) {
        authen(req, res, function () {
            new Promise(function (resolve, reject) {
                addRtFlow(req, resolve, reject)
            }).then((data) => {
                res.send({
                    status: 'ok',
                    _id: data.insertedIds[0]
                })
            }).catch(function (err) {
                res.send({
                    status: 'failed',
                    message: 'Error in getting restaurants - ' + err
                })
            })
        })
    })

    app.post(restaurantUrl, function (req, res) {
        authen(req, res, function () {
            new Promise(function (resolve, reject) {
                addRtFlow(req, resolve, reject)
            }).then(function (data) {
                res.redirect('/restaurant/display/' + data.ops[0]._id)
            }).catch(function (err) {
                res.send(alertMsg('Error in adding restaurants - ' + err))
            })
        })
    })

    app.post(restaurantUrl + '/rate/:id', function (req, res) {
        authen(req, res, function () {
            let id = req.params.id
            let rate = req.body.rate
            new Promise(function (resolve, reject) {
                global.rt.find({
                    _id: new ObjectID(id)
                }).limit(1).toArray(function (err, data) {
                    resolve(data)
                })
            }).then(function (data) {
                return data[0].grades.map(function (grade) {
                    if (grade.user == req.session.username) {
                        try {
                            throw ('You have already rated the restaurant')
                        } catch (err) {
                            res.send(alertMsg('Failed to rate restaurant- ' + err))
                        }
                    }
                })
            }).then(function (data) {
                return global.rt.update({
                    _id: new ObjectID(id)
                }, {
                    $push: {
                        grades: {
                            user: req.session.username,
                            score: rate
                        }
                    }
                })
            }).then(function () {
                res.redirect('/restaurant/display/' + id)
            })

        })
    })

    app.get(restaurantUrl + '/delete/:id', function (req, res) {
        authen(req, res, function () {
            let id = req.params.id
            const owner = req.session.username
                id = new ObjectID(id)
                new Promise(function (resolve, reject) {
                    global.rt.find({
                        _id: id
                    }).limit(1).toArray(function (err, data) {
                        resolve(data)
                    })
                }).then(function (data) {
            try {                
                    if (data[0].owner != owner) throw ('No Permission')
                    return global.rt.remove({
                        _id: id
                    })
                } catch (err) {
                    res.send(alertMsg('Failed to delete restaurant- ' + err))
                }
                }).then(function () {
                    res.redirect('/restaurant')
                })
            
        })
    })

    function addRtFlow(req, resolve, reject) {
        let formData = getFormData(req)
        formData['grades'] = []
        new Promise(function (resolve, reject) {
            global.rt.find({
                name: formData.name
            }).limit(1).toArray((err, data) => {
                resolve(data)
            })
        }).then(function (data) {
            if (data.length > 0) return reject('duplicate restaurant name')
            return global.rt.count()
        }).then(function (count) {
            formData['restaurant_id'] = count + 1
            return global.rt.insert(formData)
        }).then(function (savedRestaurant) {
            resolve(savedRestaurant)
        })
    }

    function getFormData(req) {
        // const restaurant_id = req.body.restaurant_id
        const name = req.body.name
        const cuisine = req.body.cuisine
        const borough = req.body.borough
        const street = req.body.street
        const building = req.body.building
        const zipcode = req.body.zipcode
        const gpsLon = req.body.longtitude
        const gpsLat = req.body.latitude
        // const photo = req.body.photo
        const owner = req.session.username || 'root'
        const errMsg = ' is not defined'
        const photo = getPhoto(req)
        assert.notEqual(name, undefined, 'name' + errMsg)
        assert.notEqual(owner, undefined, 'owner' + errMsg)

        let restaurantToAdd = {
            name,
            cuisine,
            borough,
            address: {
                street,
                building,
                zipcode,
                coord: {
                    longtitude: gpsLon,
                    latitude: gpsLat
                }
            },
            photo,
            owner: owner,
            created_at: new Date()
        }
        return restaurantToAdd
    }

    function getPhoto(req) {
        var photo = {}
        if (req.files && req.files.rtPhoto) {
            photo = req.files.rtPhoto
            var fileName = photo.name,
                type = photo.mimetype
            const uploadPath = global.rootPath + '/public/images/' + req.body.name + '.' + type.replace('image/', '')
            photo.mv(uploadPath, function (err) {
                if (err)
                    return res.status(500).send(err)
            })
            photo['uploadPath'] = uploadPath
        }
        return photo
    }

    // catch 404 and forward to error handler
    app.use(function (req, res, next) {
        // var err = new Error('Not Found')
        // err.status = 404
        // next(err)
        res.redirect('/')
    })

    // error handlers

    // development error handler
    // will print stacktrace
    if (app.get('env') === 'development') {
        app.use(function (err, req, res, next) {
            res.status(err.status || 500)
            res.render('error', {
                message: err.message,
                error: err
            })
        })
    }

    // production error handler
    // no stacktraces leaked to user
    app.use(function (err, req, res, next) {
        res.status(err.status || 500)
        res.render('error', {
            message: err.message,
            error: {}
        })
        // res.redirect('/')
    })

    function authen(req, res, callback) {
        if (global.userSet.has(req.session.username)) {
            callback()
        } else {
            res.render('userForm')
        }
    }

    function alertMsg(msg) {
        return '<script>alert("' + msg + '");window.history.back()</script>'
    }

    
  

    // app.listen(port, function () {
    //     console.log('Server listening on port 1994')
    // })

    

    
})
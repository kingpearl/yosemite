/**
 * Yosemite App
 * Copyright(c) 2015 King Pearl LLC
 */
var cluster = require('cluster'),
fs = require('fs'),
http = require('http'),
mime = require('mime-types'),
koa = require('koa'),
bodyParser = require('koa-bodyparser'),
compress = require('koa-compress'),
logger = require('koa-logger'),
route = require('koa-route'),

port = process.env.PORT || 5000,

ONE_HOUR = 60 * 60,
ONE_WEEK = ONE_HOUR * 24 * 7,
ONE_MONTH = ONE_WEEK * 4,
ONE_YEAR = ONE_MONTH * 12,

// mime type regexps
RE_MIME_IMAGE = /^image/,
RE_MIME_FONT = /^(?:application\/(?:font-woff|x-font-ttf|vnd\.ms-fontobject)|font\/opentype)$/,
RE_MIME_DATA = /^(?:text\/(?:cache-manifest|html|xml)|application\/(?:(?:rdf\+)?xml|json))/,
RE_MIME_FEED = /^application\/(?:rss|atom)\+xml$/,
RE_MIME_FAVICON = /^image\/x-icon$/,
RE_MIME_MEDIA = /(image|video|audio|text\/x-component|application\/(?:font-woff|x-font-ttf|vnd\.ms-fontobject)|font\/opentype)/,
RE_MIME_CSSJS = /^(?:text\/(?:css|x-component)|application\/javascript)/,

// misc regexps
RE_WWW = /^(www|localhost)\./
RE_MSIE = /MSIE/,
RE_HIDDEN = /(^|\/)\./,
RE_SRCBAK = /\.(?:bak|config|sql|fla|psd|ini|log|sh|inc|swp|dist)|~/,

// load additional node mime types
types = require('./app-types.json')
Object.keys(types).forEach(function(type) {
	var exts = types[type] || []
	mime.extensions[type] = mime.extensions[type] || []
	exts.forEach(function(ext) {
  		if (!~mime.extensions[type].indexOf(ext))
  		mime.extensions[type].push(ext)
  	
  		mime.types[ext] = type
	})
})

module.exports = function() {
	return new App()
}

/**
 * App
 */
var App = function() {
}

App.prototype = {

	/**
	 * cluster
	 */
	cluster: function(options, worker) {
		var cpus = options.number ? parseInt(options.number, 10): require('os').cpus().length,
		sigs = ['SIGQUIT', 'SIGTERM']

		sigs.forEach(
		function(sig) {
			process.on(sig,
			function() {
				process.exit(1)
			})
		})

		if (cluster.isMaster) {
			console.log('Yosemite Cluster started')

			for (var i=0; i < cpus; i++) {
				cluster.fork()
			}

			cluster.on('exit',
			function(child) {
				cluster.fork()
			})
		}
		else
		worker()
	},

	/**
	 * createServer
	 */
	createServer: function(options) {
		var self = this,
		options = options || {}, 
		app = koa()

		if (process.env.NODE_ENV !== 'production')
		app.use(logger())
		
  		app.use(bodyParser())

  		app.use(compress())

  		app.use(self.headers({ 
			cors: options.cors || true,
			// www: options.www || false,
			secure: options.secure || false }))

  		/**
  		 * Routes
  		 */
  		app.use(route.get('/', function *() {
  			this.body = { 'text': 'Hello World' }
  		}))

		return app
	},

	/**
	 * Files
	 */
	files: function(dir, ret) {
		var self = this

		ret = ret || []

		fs.readdirSync(dir).filter(
		function(path) {
			return !~['node_modules', '.git'].indexOf(path)
		}).forEach(
		function(p){
			p = path.join(dir, p)

			if (fs.statSync(p).isDirectory())
			self.files(p, ret)
			else if (p.match(/\.js$/))
			ret.push(p)
		})

		return ret
	},

	/**
	 * Headers
	 */
	headers: function(options) {
		options = options || {}

		return function *(next) {
			var self = this,
			url = this.request.url,
			pathname = this.request.path || '/',
			host = this.request.headers.host,
			ua  = this.request.headers['user-agent'],
			cc = '',
			type = '',

			/**
			 * private function to respond with the appropriate http status code.
			 * @param {Number} code a valid http status code.
			 */
			respond = function(code) {
				var err = new Error(http.STATUS_CODES[code])
				
				err.status = code

				// early return for:
				// - redirects
				// - forbidden, prioritize 403 over 404
				if (/301|302|403/.test(err.status)) {
					self.response.status = err.status
					self.response.body = err.message
				}
				else
				self.throw(err.status, err.message)
			}


			// Block access to "hidden" directories or files whose names begin with a
			// period. This includes directories used by version control systems such as
			// Subversion or Git.

			if (RE_HIDDEN.test(pathname))
			return respond(403)
			
			// Block access to backup and source files. These files may be left by some
			// text/html editors and pose a great security danger, when anyone can access
			// them.

			if (RE_SRCBAK.test(pathname))
			return respond(403)
			
			/**
			 * Suppress or force the "www." at the beginning of URLs
			 */

			/* var www = options.www,
			re = RE_WWW

			if (typeof www != 'boolean') {
				re = www
				www = false
			}

			if (www && re.test(host)) {
				this.response.status = 301
				this.set('Location', (options.secure && !this.request.secure ? 'https://': '//') + host.replace(re, '') + url)
				return respond(301)
			}
			
			if (!www && !re.test(host)) {
				this.set('Location', (options.secure && !this.request.secure ? 'https://': '//') + 'www.' + host + url)
				return respond(301)
			}
			
			if (options.secure && !this.request.connection.socket) {
				this.set('Location', 'https://' + host + url)
				return respond(301)
			} */

			/**
			 * Built-in filename-based cache busting
			 */

			this.request.baseUrl = this.request.url
			this.request.url = this.request.url.replace(/^(.+)\.(\d+)\.(js|css|png|jpg|gif)$/, '$1.$3')

			// hack: send does not compute ETag if header is already set, this save us ETag generation
			this.set('Cache-Control', '')
			// hack: send does not compute ETag if header is already set, this save us ETag generation
			this.set('ETag', '')

			// Here we delegate it to `node-mime` which already does that for us and maintain a list of fresh
			// content types.
			//  https://github.com/broofa/node-mime
		 
			type = this.get('Content-Type')
			// normalize unknown types to empty string
			if (!type || !mime.extension(type.split(';')[0]))
			type = ''

			/**
			 * Better website experience for IE users
			 */

			if (RE_MSIE.test(ua) && ~type.indexOf('text/html'))
			this.set('X-UA-Compatible', 'IE=Edge')

			/**
			 * Cross-domain AJAX requests
			 */

			if (options.cors)
			this.set('Access-Control-Allow-Origin', '*')

			/**
			 * CORS-enabled images (@crossorigin)
			 */

			if (RE_MIME_IMAGE.test(type))
			this.set('Access-Control-Allow-Origin', '*')

			/**
			 * Webfont access
			 */

			if (RE_MIME_FONT.test(type) || '/font.css' == pathname)
			this.set('Access-Control-Allow-Origin', '*')

			/**
			 * Expires headers (for better cache control)
			 */
			if (!type || RE_MIME_DATA.test(type))
			cc = 'public,max-age=0'
			else if (RE_MIME_FEED.test(type))
			cc = 'public,max-age=' + ONE_HOUR
			else if (RE_MIME_FAVICON.test(type))
			cc = 'public,max-age=' + ONE_WEEK
			else if (RE_MIME_MEDIA.test(type))
			cc = 'public,max-age=' + ONE_MONTH
			else if (RE_MIME_CSSJS.test(type))
			cc = 'public,max-age=' + ONE_YEAR
			else
			cc = 'public,max-age=' + ONE_MONTH

			/**
			 * Prevent mobile network providers from modifying your site
			 */

			cc += (cc ? ',' : '') + 'no-transform'
			this.set('Cache-Control', cc)

			/**
			 * ETag removal
			 */

			this.remove('ETag')

			/**
			 * Stop screen flicker in IE on CSS rollovers
			 */

			// TODO

			/**
			 * Set Keep-Alive Header
			 */

			this.set('Connection', 'keep-alive')

			/**
			 * Cookie setting from iframes
			 */

			// TODO

			/**
			 * A little more security
			 */

			// do we want to advertise what kind of server we're running?

			this.remove('X-Powered-By')

			yield next
		}
	},

	/**
	 * Watch
	 */
	watch: function(files, fn) {
		var options = { interval: 5000 }

		files.forEach(
		function (file) {
			fs.watchFile(file, options, 
			function (curr, prev) {
				if (prev.mtime < curr.mtime) 
				fn(file)
			})
		})
	}
}

if (!module.parent) {
	var me = new App().createServer()

	me.listen(port)
	console.log('Yosemite App listening on port %d', port)
}
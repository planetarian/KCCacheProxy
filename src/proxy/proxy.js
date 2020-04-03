const { createServer } = require("http")
const { createProxyServer } = require("http-proxy")
const { connect } = require("net")
const { parse } = require("url")

const cacher = require("./cacher")
const Logger = require("./ipc")

const { verifyCache } = require("./verifier")
const { getConfig } = require("./config")
const { port, preloadOnStart } = getConfig()

const KC_PATHS = ["/kcs/", "/kcs2/", "/kcscontents/", "/gadget_html5/", "/html/"]

const proxy = createProxyServer({})
const server = createServer(async (req, res) => {
    const { method, url } = req

    Logger.log(method + ": " + url)

    if(method !== "GET" || (!KC_PATHS.some(path => url.includes(path))) || url.includes(".php"))
        return proxy.web(req, res, {
            target: `http://${req.headers.host}/`,
            timeout: getConfig().timeout
        })

    return await cacher.handleCaching(req, res)
})

// https://github.com/http-party/node-http-proxy/blob/master/examples/http/reverse-proxy.js
server.on("connect", (req, socket) => {
    Logger.log(`${req.method}: ${req.url}`)

    socket.on("error", (...a) => Logger.error("Socket error", ...a))

    const serverUrl = parse("https://" + req.url)
    const srvSocket = connect(serverUrl.port, serverUrl.hostname, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n" +
            "Proxy-agent: Node-Proxy\r\n" +
            "\r\n")

        srvSocket.pipe(socket)
        socket.pipe(srvSocket)
    })
    srvSocket.on("error", (...a) => Logger.error("Srvsocket error", ...a))
})
server.on("error", (...a) => Logger.error("Server error", ...a))
proxy.on("error", (error) => Logger.error(`Proxy error: ${error.code}: ${error.hostname}`))

const main = async () => {
    // Verify cache
    if (process.argv.length > 2) {
        if(process.argv.find(k => k.toLowerCase() == "verifycache"))
            verifyCache()
    }
}

Logger.log(`Listening on port ${port}`)
server.listen(port)

if(preloadOnStart)
    require("./preload")

main()
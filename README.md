# TSM-market-simulation

A simple trading market design. It consists of a backend written in Typescipt and frontend in HTML/Javascript.

## TOC
1. Features
2. Setup
3. Known Issues
4. Future

### 1. Features
- Simple trade bots
- Admin console via a unix socket
### 2. Setup

Firstly, provide a ```.env``` file. It should follow this format:
```sh
APP_ADDR="127.0.0.1"
APP_PORT="8080"
APP_SECRET="[your secret]"
SOCKET_PATH="admin.sock"
```

```APP_SECRET``` is the only variable required for the correct operation of the system, all others have a hard-coded default.

You should also provide several configs:
- ```stocks.json``` controls available stocks and their initial price. Omiting this config, market will fall back on hard-coded defaults. If a market save state exists, this config is not used. 
```javascript
{
    "[stock short name]": {
        "name": "[stock full name]",
        "initialPrice": "[initial asking price]",
        "fractional": true
    },
    .
    .
    .
}
```

##
- ```botcfg.json``` controls the behaviour of trading bots on the market. If this config is omitted, no bots will be present on the site.
```javascript
{
    "[bot name]": {
        "aggressivity": "[number of trasactions per tick]",
        "startingPortfolio": {
            "cash": "[amount of cash ownet by bot]",
            "assets": {
                "[stock: value, amount of stocks owned by bot]"
            }
        },
        "setPrice": {
            "[stock: value, set price of stocks]"
        },
        "tickLength": "[time between ticks, in seconds]"
    },
    .
    .
    .
}
```

##
- ```tradeable.json``` is the part of the game aspect of the market. It controls the options avalaible in the in-game store. If omitted, market will fall back on the hard-coded defaults.
```javascript
[
    {
        "name": "[display name]",
        "price": "[price]"
    },
    .
    .
    .
]
```



To start the market connect to the control socket (for example ```nc -U [control socket]```) and issue a start command: ```set market on```. To stop the market, use: ```set market off```. This starts the main loop and bot timers.

### 3. Known Issues

- Saving users does not save their portfolio data
- Although supported, there is nothing enforcing stocks to be fractional/non-fractional. All are treated as ```"fractional": true```
- Websocket connection times out sometimes, requiring a page refresh to reconnect
- On mobile devices, graph sometimes covers up some content

### 4. Future
As of now, the development is paused. There will be no new features added nor any updates provides for the time being. Minor bug fixes may be rolled out occasionaly.
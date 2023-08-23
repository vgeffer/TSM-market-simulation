$ = (e) => { return document.getElementById(e); }


//Get ws connection token, connect to ws, get market status
window.onload = async () => {

    //Assign callbacks
    $("buy-make-offer").addEventListener("click", buy);
    $("sell-make-offer").addEventListener("click", sell);

    $("logout").addEventListener("click", () => { window.location = "/secure/logout" });

    $("buy-amount").addEventListener("input", () => { updateTotal("buy") });
    $("buy-unit").addEventListener("input", () => { updateTotal("buy") });

    $("sell-amount").addEventListener("input", () => { updateTotal("sell") });
    $("sell-unit").addEventListener("input", () => { updateTotal("sell") });

    

    //Exchange trade token for ws auth token
    const res = await fetch("/secure/auth", {
        method: 'POST', 
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: JSON.stringify({
			type: "reauth"
        })
	});

    if (res.status !== 200)
        window.location = "/";

    const token = await res.text();

    socket = new WebSocket(`${(location.protocol === "https:" ? "wss:" : "ws:")}//${location.host}`);
    document.ws = socket; 

	socket.addEventListener("open", (e) => {
        
		socket.send(JSON.stringify({
            type: "auth",
            content: token
        }));
	});

	socket.addEventListener("message", (e) => {
		console.log("Message from The Server ", e.data);
        try {
            const msgData = JSON.parse(e.data);
            //Do basic format check
            if (typeof msgData.type === "undefined" || typeof msgData.content === "undefined")
                return console.error(`Message ${e.data} lacks type and/or content`);

            parseSocketMessage(msgData);
        } catch (err) {

            console.error(`Error parsing incoming message: ${err.message}`);
        }
    });

    try {
        const marketData = await marketSync();
        document.market = JSON.parse(marketData);

        const portfolioData = await portfolioSync();
        document.portfolio = JSON.parse(portfolioData);

    } catch(e) {

        displayFatal(e.message, "Reload", () => { window.location = window.location; });
    }

    //Display defaults
    document.selectedStock = Object.keys(document.market)[0]; //Select first provided stock
    populateMarkets();
    updateDisplay(document.selectedStock, null); //By default - display first item; null = change everything
}

function parseSocketMessage(msg) {

    switch (msg.type) {

        case "auth":

            if (msg.content !== "ok")
                return displayFatal("Unable to establish connection to the server. Please try logging in again.", "Logout", () => { window.location = "/secure/logout" });

            document.userID = msg.user;
            break;

        case "broadcast":
            
            if (typeof msg.content.stock === "undefined")
                return console.error(`Message ${msg.content} lacks does not specify stock`);

            if (typeof msg.content.order !== "undefined")
                return processOrder(msg.content.stock, msg.content.order);
            
            else if (typeof msg.content.transaction !== "undefined")
                return processTransaction(msg.content.stock, msg.content.transaction);

            else if (typeof msg.content.cancel !== "undefined") 
                return processCancelation(msg.content.stock, msg.content.cancel);
            break;
    
        case "payment":
            if (typeof msg.content.stock === "undefined")
                return console.error(`Message ${msg.content} lacks does not specify stock`);

            if (typeof msg.content.amount === "undefined")
                return console.error(`Message ${msg.content} lacks does not specify amount`);

            if (msg.content.stock === "cash")
                document.portfolio.cash += msg.content.amount;
            else {
                if (typeof document.portfolio.assets[msg.content.stock] === "undefined")
                    document.portfolio.assets[msg.content.stock] = 0;
                document.portfolio.assets[msg.content.stock] += msg.content.amount; 
            }

            updateDisplay((msg.content.stock === "cash" ? document.selectedStock : msg.content.stock), ["portfolio"]); //If cash update always, otherwise only when neceseary

            break;

        default:
            console.error(`Unknown message type: ${msg.type}`);
    
    }
}

/*
 *
 * Message Processing
 * 
 */
function processOrder(stock, order) {
    
    //Save order
    if (order.type === 0) {

        document.market[stock].currentPrice.bidPrice = order.totalPrice / order.units;
        document.market[stock].activeBuyOrders.push(order);
    }
    else { 

        document.market[stock].currentPrice.askPrice = order.totalPrice / order.units;
        document.market[stock].activeSellOrders.push(order);
    }

    
    document.market[stock].activeBuyOrders.sort((a, b) => { //Wants to buy for the most (lowest to highest)
        return (a.totalPrice / a.units) - (b.totalPrice / b.units);
    });
            
    document.market[stock].activeSellOrders.sort((a, b) => { //Wants to sell for the least (highest to lowest)
        return (b.totalPrice / b.units) - (a.totalPrice / a.units);
    });

    updateDisplay(stock, ["orders", "order-prices"]);
}

function processTransaction(stock, transaction) {



    const stockData = document.market[stock];
    if (transaction.outputOrder !== null) {

        const updateOrderList = (transaction.outputOrder.type === 0 ? stockData.activeBuyOrders : stockData.activeSellOrders);
        const deleteOrderList = (transaction.outputOrder.type !== 0 ? stockData.activeBuyOrders : stockData.activeSellOrders);

        let x = 0;
        for(;updateOrderList[x].ouid !== transaction.outputOrder.ouid; x++)
            if (typeof updateOrderList[x] === "undefined") { x = -1; break; } 


        if (x === -1) 
            updateOrderList.push(transaction.outputOrder);

        else 
            updateOrderList[x] = transaction.outputOrder; 

        const deleteOID = (transaction.outputOrder.type !== 0 ? transaction.buyOID : transaction.sellOID);
        for (let x = 0; deleteOrderList.length; x++) {
            if (deleteOrderList[x].ouid === deleteOID) {

                deleteOrderList.splice(x, 1);
                break;
            }
        }
    }
    else {
        

        for (let x = 0; stockData.activeBuyOrders.length; x++) {
            if (stockData.activeBuyOrders[x].ouid === transaction.buyOID) {

                stockData.activeBuyOrders.splice(x, 1);
                break;
            }
        }

        for (let x = 0; stockData.activeSellOrders.length; x++) {
            if (stockData.activeSellOrders[x].ouid === transaction.sellOID) {

                stockData.activeSellOrders.splice(x, 1);
                break;
            }
        }
    }


    let currentTime = Date.now();
    while (typeof stockData.priceHistory[currentTime] !== "undefined")
        currentTime++;

    stockData.priceHistory[currentTime] = transaction.totalPaid / transaction.totalSold;

    updateDisplay(stock, ["orders", "price-graph"]);
}

function processCancelation(stock, oid) {
    
    //Since we only know the order id - we must check for it in all lists

    let searchedList = document.market[stock].activeBuyOrders;
    for (let x = 0; x < searchedList.length; x++) {
        if (searchedList[x].ouid === oid) {

            searchedList.splice(x, 1);
            return updateDisplay(stock, ["orders"]);
        }
    }

    searchedList = document.market[stock].activeSellOrders;
    for (let x = 0; x < searchedList.length; x++) {
        if (searchedList[x].ouid === oid) {

            searchedList.splice(x, 1);
            return updateDisplay(stock, ["orders"]);;
        }
    }
}

/*
 *
 * Market and user Sync
 * 
 */
async function marketSync() {
    
    const res = await fetch("/secure/market", {
        method: 'GET',
        credentials: 'same-origin'
    });

    if (res.status === 401)
        window.location = "/secure/logout"; //401 = auth error

    if (res.status !== 200)
        throw new Error(await res.text());

    return await res.text();
}

async function portfolioSync() {

    const res = await fetch("/secure/portfolio", {
        method: 'GET',
        credentials: 'same-origin'
    });

    if (res.status === 401)
        window.location = "/secure/logout"; //401 = auth error

    if (res.status !== 200)
        throw new Error(await res.text());

    return await res.text();
}

/*
 * 
 * Trade-handling functions
 *
 */
async function makeOrder(action, stock, amount, price) {
    
    const res = await fetch(`/secure/trade/${stock}/${action}/${amount}/${price}`, {
        method: 'PUT',
        credentials: 'same-origin'
    });

    //User auth issue - log out and force user to reauth
    if (res.status === 401)
        window.location = "/secure/logout"; 

    //Client and server are out of sync - do a resync
    if (res.status === 403) {

        const portfolioData = await portfolioSync();
        document.portfolio = JSON.parse(portfolioData);
        updateDisplay(stock, ["portfolio"]);

        throw new Error(await res.text());
    }

    //Another device is logged in to the same profile - display fatal error
    if (res.status === 409) {
        const error = await res.text();
        displayFatal(error, "Logout", () => { window.location = "/secure/logout" });

        throw new Error(error);
    }

    if (res.status !== 200)
        throw new Error(await res.text());

    return await res.text();
}

async function cancelOrder(stock, oid) {

    const res = await fetch(`/secure/trade/${stock}/cancel/${oid}`, {
        method: 'PUT',
        credentials: 'same-origin'
    });

    //Reauth user
    if (res.status === 401)
        window.location = "/secure/logout"; //401 = auth error

    //Fatal error - logged in elsewhere
    if (res.status === 409) {
        const error = await res.text();
        displayFatal(error, "Logout", () => { window.location = "/secure/logout" });
        return;
    }

    //Order is most likely canceled, do a market refresh
    if (res.status !== 200) {
        const marketData = await marketSync();
        document.market = JSON.parse(marketData);

        updateDisplay(stock, null);
    } 
    
    else return;
}

function getOrderByID(stock, oid) {
    const stockData = document.market[stock];
    if (typeof stockData === "undefined")
        return undefined;

    const orderList = stockData.activeBuyOrders.concat(stockData.activeSellOrders);

    for (const order of orderList) {
        if (order.ouid === oid)
            return order;
    }

    return undefined;
}

/*
 * 
 * UI Handlers
 *
 */
function updateDisplay(stock, delta) {

    if (document.selectedStock !== stock)
        return; //If we aren't currently viewing this stock, there is no need to update visuals

    if (delta === null) 
        delta = ["orders", "order-prices", "price-graph", "portfolio"];

    for (const update of delta) {

        switch (update) {
            case "orders": 

                //Remove all children
                $("buy-orders").replaceChildren();
                $("sell-orders").replaceChildren();

                //Concat arrays (so that we loop only once)
                const orderList = document.market[stock].activeBuyOrders.concat(document.market[stock].activeSellOrders);
                for (const order of orderList) {

                    const orderParent = document.createElement("span");

                    const orderListing = document.createElement("p"); //TODO: Debug
                    orderListing.textContent = `Amount: ${order.units}, Unit Price: ${order.totalPrice / order.units}, OrderID: ${order.ouid}`;       
                    orderParent.appendChild(orderListing);

                    if (document.userID === order.cuid) {
                        const orderCancel = document.createElement("a");
                        orderCancel.textContent = "Cancel Order"; 
                        orderCancel.href = "javascript:void(0)";
                        orderCancel.addEventListener("click", () => { cancelOrder(stock, order.ouid) });
                        orderParent.appendChild(orderCancel);
                    }

                    $(order.type === 0 ? "buy-orders" : "sell-orders").appendChild(orderParent);
                }
                break;
            
            case "order-prices":
                $("current-bid").textContent = `Latest buy price: ${document.market[stock].currentPrice.bidPrice}/unit`;
                $("current-ask").textContent = `Latest sell price: ${document.market[stock].currentPrice.askPrice}/unit`;
                break;

            case "price-graph":


                const graphLayout = {
                    title: {
                        text: `${document.market[stock].name} (${stock})`
                    },
                    datarevision: Date.now(),
                    paper_bgcolor: "#181818",
                    plot_bgcolor: "#181818",
                    font: {
                        color: "#FFFFFF",
                    },
                    modebar: {
                        color: "#FFFFFF",
                    },
                    xaxis: {
                        autorange: true,
                        rangeslider: {
                            bordercolor: "#FFFFFF"
                        },
                        color: "#AAAAAA"
                    },
                    yaxis: {
                        autorange: true,
                        color: "#AAAAAA"
                    }
                };
                
                const graphProperties = {
                    modeBarButtonsToRemove: ["toImage", "zoom2d", "pan2d"],
                    displaylogo: false, //TODO: ?
                    responsive: true
                };

                let x = [], y = [];
                for (const item in document.market[stock].priceHistory) {
                    const date = new Date(Number(item));

                    x.push(date.toLocaleTimeString("sk-SK")); //TODO: Time Milis
                    y.push(document.market[stock].priceHistory[item]);
                }

                const data = [{
                    type: "scatter", 
                    mode: "lines", 
                    x: x,
                    y: y,

                }];

                Plotly.react($("graph"), data, graphLayout, graphProperties);
            
                break;
            
            case "portfolio":
                
                if (typeof document.portfolio.assets[stock] === "undefined")
                    document.portfolio.assets[stock] = 0;
                
                $("cash-owned").textContent = `Cash owned: ${document.portfolio.cash}`;
                $("stock-owned").textContent = `${stock} owned: ${document.portfolio.assets[stock]}`;
                break;
        }
    }
}

function displayFatal(message, buttonText, callback) {
    
    $("msg-server").textContent = message;
    $("msg-exit").textContent = buttonText;
    $("msg-exit").addEventListener("click", callback);

    $("fatalerr").classList.remove("hidden");
    $("content").classList.add("blur");
}

function populateMarkets() {

    //Only do this on first call of the function
    if ($("stock-selector").children.length !== 0)
        return;

    const parent = $("stock-selector");

    for (const item in document.market) {


        const stockSelector = document.createElement("a");
        stockSelector.id = item;
        stockSelector.href = "javascript:void(0)"
        stockSelector.textContent = item;
        stockSelector.addEventListener("click", () => { 
            document.selectedStock = item; 
            updateDisplay(item, null);
        });

        
        parent.appendChild(stockSelector);
    }
}

/*
 * 
 * Random event handlers
 *
 */
function updateTotal(action) {
    const total = $(`${action}-amount`).value * $(`${action}-unit`).value;
    $(`${action}-total`).textContent = `Total Price: ${total}`;
}

async function buy() {

    const bidPrice = $("buy-amount").value * $("buy-unit").value;
    if (document.portfolio.cash < bidPrice) {

        $("buy-error").classList.remove("hidden");
        $("buy-error").textContent = "Not enough cash to make the order.";

        return; 
    }


    try {
        
        await makeOrder("buy", document.selectedStock, $("buy-amount").value, bidPrice);

    } catch (e) {

        $("buy-error").classList.remove("hidden");
        $("buy-error").textContent = `Error processing order: ${e.message}`;
        return;
    }

    document.portfolio.cash -= bidPrice;
    updateDisplay(document.selectedStock, ["portfolio"]);

    //Reset order inputs
    $("buy-amount").value = 0;
    $("buy-unit").value = 0;
    updateTotal("buy");
}

async function sell() {

    const askPrice = $("sell-amount").value * $("sell-unit").value;
    if (typeof document.portfolio.assets[document.selectedStock] === "undefined" || document.portfolio.assets[document.selectedStock] < $("sell-amount").value) {
    
        $("sell-error").classList.remove("hidden");
        $("sell-error").textContent = `Not enough ${document.selectedStock} to make the order`;
        return; 
    }


    try {
        
        await makeOrder("sell", document.selectedStock, $("sell-amount").value, askPrice);

    } catch (e) {

        $("sell-error").classList.remove("hidden");
        $("sell-error").textContent = `Error processing order: ${e.message}`;
        return;
    }

    document.portfolio.assets[document.selectedStock] -= $("sell-amount").value;
    updateDisplay(document.selectedStock, ["portfolio"]);

    //Reset order inputs
    $("sell-amount").value = 0;
    $("sell-unit").value = 0;
    updateTotal("sell");
}
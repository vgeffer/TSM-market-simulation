$ = (e) => { return document.getElementById(e); }


//Get ws connection token, connect to ws, get market status
window.onload = async () => {
    
    //Exchange trade token for ws auth token
    const res = await fetch("/merchant/secure/auth", {
        method: 'POST', 
        credentials: 'same-origin'
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
        const userData = await userSync();
        document.users = JSON.parse(userData);

        const tradeableData = await tradableSync();
        document.tradeables = JSON.parse(tradeableData);

    } catch(e) {

        displayFatal(e.message, "Reload", () => { window.location = window.location; });
    }

    populateUsers();
    populateTradeables();
    document.selectedUser = 0;
    while (typeof document.users[document.selectedUser] !== "undefined" && document.users[document.selectedUser].merchant)
        document.selectedUser++;
    updateDisplay(document.selectedUser); //By default - display first item; null = change everything
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
                return processOrder(msg.content.order);
            
            break;
    
        case "payment":
            if (typeof msg.content.stock === "undefined")
                return console.error(`Message ${msg.content} lacks does not specify stock`);

            if (typeof msg.content.amount === "undefined")
                return console.error(`Message ${msg.content} lacks does not specify amount`);

            const user = getUserByID(msg.user);
            if (typeof user === "undefined") 
                break;
            
            if (msg.content.stock === "cash")
                user.user.portfolio.cash += msg.content.amount; //Heh user.user :D
            
            updateDisplay(user.index);

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
function processOrder(order) {
    
    //Money only changes during buy order, so disregard any other
    if (order.type !== 0) 
        return;

    const user = getUserByID(order.cuid);
    user.user.portfolio.cash -= order.totalPrice;

    updateDisplay(user.index);
}

/*
 *
 * Market and user Sync
 * 
 */
async function userSync() {

    const res = await fetch("/merchant/secure/users", {
        method: 'GET',
        credentials: 'same-origin'
    });

    if (res.status !== 200)
        throw new Error(await res.text());

    return await res.text(); 
}

async function tradableSync() {
    const res = await fetch("/merchant/secure/tradeables", {
        method: 'GET',
        credentials: 'same-origin'
    });

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
        updateDisplay(stock);

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

function getUserByID(uid) {

    for (let x = 0; x < document.users.length; x++) {
        if (document.users[x].usid === uid)
            return {
                index: x,
                user: document.users[x]
            };
    }
    return undefined;
}


/*
 * 
 * UI Handlers
 *
 */
function updateDisplay(user) {

    if (document.selectedUser !== user)
        return; //If we aren't currently viewing this stock, there is no need to update visuals

    const displayedUser = document.users[user];

    //No delta needed, since updating portfolio most likely updates tradables
    if (typeof displayedUser.portfolio === undefined)
        return;
    
    $("cash-owned").textContent = `Cash owned: ${displayedUser.portfolio.cash}`;
    

    for (let x = 0; x < document.tradeables.length; x++) {


        if ($(`wrap-${x}`).classList.contains("hidden") && document.tradeables[x].price <= displayedUser.portfolio.cash)
            $(`wrap-${x}`).classList.remove("hidden");
    
        else if (!$(`wrap-${x}`).classList.contains("hidden") && document.tradeables[x].price > displayedUser.portfolio.cash)
            $(`wrap-${x}`).classList.add("hidden");
    }    
}

function displayFatal(message, buttonText, callback) {
    
    $("msg-server").textContent = message;
    $("msg-exit").textContent = buttonText;
    $("msg-exit").addEventListener("click", callback);

    $("fatalerr").classList.remove("hidden");
    $("content").classList.add("blur");
}

function populateUsers() {

    //Only do this on first call of the function
    if ($("user-selector").children.length !== 0)
        return;

    const parent = $("user-selector");
    const selectables = $("selectableUser");


    for (let x = 0; x < document.users.length; x++) {

        if (document.users[x].merchant)
            continue;

        const userSelector = document.createElement("a");
        userSelector.id = `usr-${x}`;
        userSelector.href = "javascript:void(0)"
        userSelector.textContent = document.users[x].name;
        userSelector.addEventListener("click", () => { 
            document.selectedUser = x;
            updateDisplay(x);
        });


        //Save to selectables
        const selector = document.createElement("option");
        selector.value = document.users[x].name;
        selector.textContent = document.users[x].name;
    
        parent.appendChild(userSelector);
        selectables.appendChild(selector);
    }
}

function populateTradeables() {

    //Only do this on first call of the function
    if ($("item-shop").children.length !== 0)
        return;

    const parent = $("item-shop");

    for (let x = 0; x < document.tradeables.length; x++) { 
    
        const wrapper = document.createElement("li");
        wrapper.textContent = `${document.tradeables[x].name} [Price: ${document.tradeables[x].price}]`;
        wrapper.id = `wrap-${x}`;

        const selector = document.createElement("input");
        selector.type = "radio";
        selector.name = "purchasable-item";
        selector.id = `item-${x}`;
        selector.addEventListener("click", () => { 
            $("price").textContent = `Price: ${document.tradeables[x].price}`;
        });

        
        wrapper.appendChild(selector);
        parent.appendChild(wrapper);
    }
}

/*
 * 
 * Random event handlers
 *
 */

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
    updateDisplay(document.selectedStock);

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
    updateDisplay(document.selectedStock);

    //Reset order inputs
    $("sell-amount").value = 0;
    $("sell-unit").value = 0;
    updateTotal("sell");
}
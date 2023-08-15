$ = (e) => { return document.getElementById(e); }

window.onload = async () => {

    //Assign callbacks
    $("login").addEventListener("click", login);
    $("reg").addEventListener("click", register);

    //A dummy call to reauth - checks if a valid trade cookie is present. If yes, redirect to the next screen
    const payload = {
        type: "reauth"
    };
    
    try {
        await auth(payload);

    } catch (e) {

        //Well, do nothing
        return;
    }

    window.location = "/dashboard.html";
}

async function login() {
    const payload = {
        type: "login",
        name: $("login-name").value,
        passwd: $("login-pass").value
    };

    try {

        await auth(payload);

    } catch (e) {
    
        $("login-error").classList.remove("hidden");
        $("login-error").textContent = e.message;
        return;
    
    };

    window.location = "/dashboard.html";
}

async function register() {

    if ($("reg-pass").value !== $("reg-pass-again").value) {
    
        $("reg-error").classList.remove("hidden");
        $("reg-error").textContent = "passwords do not match"
    
        return;
    }
    
    const payload = {
        type: "register",
        name: $("reg-name").value,
        passwd: $("reg-pass").value
    };

    try {

        await auth(payload); //If not error we don't need the returned message

    } catch (e) {
        
        $("reg-error").classList.remove("hidden");
        $("reg-error").textContent = e.message;
        return;
    
    };

    window.location = "/dashboard.html";
}

async function auth(payload) {
    
    const res = await fetch("/secure/auth", {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: JSON.stringify(payload)
    });

    if (res.status === 302)
        window.location = "/merchant/index.html"; //302 is used to indicate merchant login

    if (res.status !== 200)
        throw new Error(await res.text());

    return await res.text();
}
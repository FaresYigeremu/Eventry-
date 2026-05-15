// var myHeaders = new Headers();
//     const publicKey = "CHASECK_TEST-09aJXdfJy8Jujjxf5oGse9D6YsJRukIX";

//     myHeaders.append("Authorization", "Bearer " + publicKey);

//   var requestOptions = {
//     method: 'GET',
//     headers: myHeaders,
//     redirect: 'follow'
//   };

//   fetch("https://api.chapa.co/v1/banks", requestOptions)
//     .then(response => response.text())
//     .then(result => console.log(result))
//     .catch(error => console.log('error', error));





// var myHeaders = new Headers();
// const publicKey = "CHASECK_TEST-09aJXdfJy8Jujjxf5oGse9D6YsJRukIX";

// myHeaders.append("Authorization", "Bearer " + publicKey);
// myHeaders.append("Content-Type", "application/json");

// var raw = JSON.stringify({
//   "business_name": "Fares Yigeremu",
//   "account_name": "Fares Yigeremu",
//   "bank_code": 855, // 128 is the code for Commercial Bank of Ethiopia (CBE)
//   "account_number": "0993672024",
//   "split_value": 50,
//   "split_type": "flat"
// });

// var requestOptions = {
//   method: 'POST',
//   headers: myHeaders,
//   body: raw,
//   redirect: 'follow'
// };

// fetch("https://api.chapa.co/v1/subaccount", requestOptions)
//   .then(response => response.json())
//   .then(result => {
//     console.log("Subaccount Created:", result);
//     if (result.status === "success") {
//         console.log("Your Subaccount ID is:", result.data.subaccount_id);
//     }
//   })
//   .catch(error => console.log('error', error));








// var myHeaders = new Headers();
// publicKey = "CHASECK_TEST-09aJXdfJy8Jujjxf5oGse9D6YsJRukIX";
// myHeaders.append("Authorization", "Bearer "+publicKey);
// myHeaders.append("Content-Type", "application/json");

// var raw = JSON.stringify({
//   "amount": "1000",
//   "currency": "ETB",
//   "email": "test@gmail.com",
//   "first_name": "likewise",
//   "last_name": "test",
//   "phone_number": "0912345678",
//   "tx_ref": "chewatatest-987664532",
//   "callback_url": "https://www.google.com/",
//   "return_url": "https://www.google.com/",
  
//   // Structured as a nested JSON object
//   "customization": {
//     "title": "Payment",
//     "description": "I love online payments."
//   },
  
//   // Structured as a nested JSON object
//   "meta": {
//     "hide_receipt": "true"
//   },
  
//   // Structured as a nested JSON object
//   "subaccounts": {
//     "id": "b3847dab-b6b9-412a-9e68-fc47d8555ed1"
//   }
// });

// var requestOptions = {
//   method: 'POST',
//   headers: myHeaders,
//   body: raw,
//   redirect: 'follow'
// };

// fetch("https://api.chapa.co/v1/transaction/initialize", requestOptions)
//   .then(response => response.text())
//   .then(result => console.log(result))
//   .catch(error => console.log('error', error));
    
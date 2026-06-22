const axios = require("axios");

const URL = "http://localhost:3000/policies/pol_185495e455ae/top-up";

const headers = {
  "Content-Type": "application/json",
  "Idempotency-Key": "test-key-1",
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhcHAtd3JpdGUiLCJ0eXBlIjoiY2xpZW50Iiwic2NvcGUiOiJwb2xpY3kucmVhZCBwb2xpY3kud3JpdGUiLCJpYXQiOjE3ODIxMjEwMTMsImV4cCI6MTc4MjEyNDYxM30.EZZqOWYTEtgH0JmcTmf9cQp_BKj8Y64NerQPoZYy3AE"
};

const sendRequest = async (i) => {
  try {
    const res = await axios.post(
      URL,
      { amount: 1000 },
      { headers }
    );

    console.log(`✅ Request ${i}:`, res.status);
  } catch (err) {
    if (err.response) {
      console.log(`❌ Request ${i}:`, err.response.status, err.response.data);
    } else {
      console.log(`🔥 Request ${i}: network error`);
    }
  }
};

(async () => {
  const requests = [];

  for (let i = 1; i <= 20; i++) {
    requests.push(sendRequest(i));
  }

  await Promise.all(requests);
})();

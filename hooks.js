const hooks = require('hooks');

hooks.beforeEach((transaction) => {
  transaction.request.headers['Authorization'] =
    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhcHAtd3JpdGUiLCJ0eXBlIjoiY2xpZW50Iiwic2NvcGUiOiJwb2xpY3kucmVhZCBwb2xpY3kud3JpdGUiLCJpYXQiOjE3ODIxMjY2NzMsImV4cCI6MTc4MjEzMDI3M30.RlkLQHK-_xvBZg0F4RgCo2Igkk7U88C73GD-LP1MNwM';
});

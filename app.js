const express = require("express"),
  companies = require("./routes/companies"),
  jobs = require("./routes/jobs");

const path = require("path");
const bodyParser = require("body-parser");
const jwt = require("express-jwt");
const jwksRsa = require("jwks-rsa");
const { auth } = require("express-openid-connect");
const { requiresAuth } = require("express-openid-connect");
const db = require("./data_functions");
const handlebars = require("express-handlebars");

const app = express();
const { Datastore } = require("@google-cloud/datastore");
const datastore = new Datastore();

const hostname = "127.0.0.1";
const port = process.env.port || 8080;

app.set("view engine", "handlebars");

app.engine(
  "handlebars",
  handlebars({
    layoutsDir: __dirname + "/views/layouts",
  })
);
app.enable("trust proxy");
app.use("/companies", companies);
app.use("/jobs", jobs);
app.use(bodyParser.urlencoded({ extended: false }));

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: CLIENT_SECRET,
  baseURL: "https://cs493a1-309217.uc.r.appspot.com",
  clientID: CLIENT_ID,
  issuerBaseURL: "https://dev-rnvxg7n6.us.auth0.com",
};

app.use(auth(config));

app.get("/", (req, res) => {
  if (req.oidc.isAuthenticated()) {
    res.redirect("/profile");
  } else {
    res.redirect("/login");
  }
});

app.get("/profile", requiresAuth(), (req, res) => {
  res.render("main", { layout: "index", tok: req.oidc.idToken });
});

app.post("/users", async (req, res) => {
  if (req.body.comp === "NONE") {
    return res.status(400).send();
  }
  let users = await db.get_all_no_pag("users");
  for (let user of users) {
    if (user.jwt === req.body.jawtee) {
      return res.status(403).send("This user already exists");
    }
  }
  let data = { jwt: req.body.jaywtee, company: req.body.comp };

  db.post_data("users", data);
  return res.status(201).send("You're ready to go!");
});

app.get("/users", async (req, res) => {
  let acceptable = req.accepts(["application/json"]);
  if (!acceptable) {
    return res.status(406).send("Invalid Content-type requested");
  } else {
    let users = await db.get_all_no_pag("users");
    /*for (let user of users) {
      let company_id = user.company;
      user.company = await db.get_by_id("companies", user.company);
      user.company.self =
        req.protocol + "://" + req.get("host") + "/companies" + company_id;
    }*/
    return res.status(200).json(users);
  }
});

app.listen(port, () => {
  console.log(`App listening at http://${hostname}:${port}`);
});

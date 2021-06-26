const express = require("express");
const { Datastore } = require("@google-cloud/datastore");
const bodyParser = require("body-parser");
const { request } = require("express");
const { body, validationResult } = require("express-validator");
const jwt = require("express-jwt");
const jwksRsa = require("jwks-rsa");
const db = require("../data_functions");
const router = express.Router();
router.use(bodyParser.json());

const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: "https://dev-rnvxg7n6.us.auth0.com/.well-known/jwks.json",
  }),

  // Validate the audience and the issuer.
  issuer: "https://dev-rnvxg7n6.us.auth0.com/",
  algorithms: ["RS256"],
  credentialsRequired: false,
});

const datastore = new Datastore();

router.post(
  "/",
  checkJwt,
  [
    body("name").exists(),
    body("type").exists(),
    body("description").exists(),
    body("website").exists(),
  ],
  async (req, res) => {
    if (
      req.user === undefined ||
      req.user.sub === undefined ||
      req.user.iss !== "https://dev-rnvxg7n6.us.auth0.com/"
    ) {
      return res
        .status(401)
        .json({ Error: "Missing or invalid authorization" });
    }
    if (!validationResult(req).isEmpty()) {
      console.log(validationResult(req));
      return res
        .status(400)
        .json({ Error: "Request object has missing or invalid attributes" });
    } else if (!req.accepts(["application/json"])) {
      return res.status(406).send("Invalid Content-type requested");
    }

    let [exists] = await db.get_company_by_name(req.body.name);

    if (exists !== undefined) {
      return res
        .status(403)
        .json({ Error: "A company with this name already exists" });
    } else {
      let data = {
        name: req.body.name,
        type: req.body.type,
        description: req.body.description,
        website: req.body.website,
      };

      let created = await db.post_data("companies", data);

      data = {
        id: created.id,
        name: data.name,
        type: data.type,
        description: data.description,
        website: data.website,
        self:
          req.protocol +
          "://" +
          req.get("host") +
          req.originalUrl +
          `/${created.id}`,
      };
      res.status(201).json(data);
    }
  }
);

router.get("/", async (req, res) => {
  let acceptable = req.accepts(["application/json"]);
  if (!acceptable) {
    return res.status(406).send("Invalid Content-type requested");
  }
  let off = req.query.offset !== undefined ? parseInt(req.query.offset, 10) : 0;
  let companies = await db.get_all("companies", off);
  let data = {};

  data["companies"] = companies[0];
  data["companies"].forEach((company) => {
    company["self"] =
      req.protocol + "://" + req.get("host") + "/companies/" + company.id;
  });
  if (companies[1].moreResults !== Datastore.NO_MORE_RESULTS) {
    data["next"] =
      req.protocol +
      "://" +
      req.get("host") +
      "/companies/" +
      `?offset=${off + 5}`;
  }
  res.status(200).json(data);
});

router.get("/:company_id", async (req, res) => {
  let acceptable = req.accepts(["application/json"]);
  if (!acceptable) {
    return res.status(406).send("Invalid Content-type requested");
  }
  let company = await db.get_by_id("companies", req.params.company_id);
  if (company === undefined) {
    return res
      .status(404)
      .json({ Error: "No company with this company_id exists" });
  } else {
    let data = {
      id: req.params.company_id,
      name: company.name,
      type: company.type,
      description: company.description,
      website: company.website,
      self: req.protocol + "://" + req.get("host") + req.originalUrl,
    };
    return res.status(200).json(data);
  }
});

router.put(
  "/:company_id",
  checkJwt,
  [
    body("name").exists(),
    body("type").exists(),
    body("description").exists(),
    body("website").exists(),
  ],
  async (req, res) => {
    if (!req.accepts(["application/json"])) {
      return res.status(406).send("Invalid Content-type requested");
    } else if (
      req.user === undefined ||
      req.user.sub === undefined ||
      req.user.iss !== "https://dev-rnvxg7n6.us.auth0.com/"
    ) {
      return res
        .status(401)
        .json({ Error: "Missing or invalid authorization" });
    } else if (!validationResult(req).isEmpty()) {
      return res.status(400).json({
        Error:
          "The request object is missing at least one of the required attributes",
      });
    }
    let current = await db.get_by_id("companies", req.params.company_id);
    if (current === undefined) {
      return res
        .status(404)
        .json({ Error: "No company with this company_id exists" });
    }
    let existing_name = await db.get_company_by_name(req.body.name);

    if (existing_name !== undefined && current.name !== req.body.name) {
      return res
        .status(403)
        .json({ Error: "A company with this name already exists" });
    } else {
      let data = {
        name: req.body.name,
        type: req.body.type,
        description: req.body.description,
        website: req.body.website,
      };
      await db.update_id("companies", req.params.company_id, data);
      data.id = req.params.company_id;
      data.self = req.protocol + "://" + req.get("host") + req.originalUrl;
      return res.status(200).json(data);
    }
  }
);

router.patch("/:company_id", checkJwt, async (req, res) => {
  if (!req.accepts(["application/json"])) {
    return res.status(406).send("Invalid Content-type requested");
  } else if (
    req.user === undefined ||
    req.user.sub === undefined ||
    req.user.iss !== "https://dev-rnvxg7n6.us.auth0.com/"
  ) {
    return res.status(401).json({ Error: "Missing or invalid authorization" });
  }
  if ("name" in req.body) {
    let existing_name = await db.get_company_by_name(req.body.name);
    if (existing_name !== undefined) {
      return res
        .status(403)
        .json({ Error: "A company with this name already exists" });
    }
  }
  let company = await db.get_by_id("companies", req.params.company_id);

  if (company === undefined) {
    return res
      .status(404)
      .json({ Error: "No company with this company_id exists" });
  } else {
    let name = "name" in req.body ? req.body.name : company.name;
    let type = "type" in req.body ? req.body.type : company.type;
    let descrip =
      "description" in req.body ? req.body.description : company.description;
    let website = "website" in req.body ? req.body.website : company.website;
    let data = {
      name: name,
      type: type,
      description: descrip,
      website: website,
    };

    await db.update_id("companies", req.params.company_id, data);

    data.id = req.params.company_id;
    data.self = req.protocol + "://" + req.get("host") + req.originalUrl;
    return res.status(200).json(data);
  }
});

router.delete("/:company_id", checkJwt, async (req, res) => {
  let exists = await db.get_by_id("companies", req.params.company_id);
  if (
    req.user === undefined ||
    req.user.sub === undefined ||
    req.user.iss !== "https://dev-rnvxg7n6.us.auth0.com/"
  ) {
    return res.status(401).json({ Error: "Missing or invalid authorization" });
  }
  if (exists === undefined) {
    return res
      .status(404)
      .json({ Error: "No company with this company_id exists" });
  } else {
    let jobs = await db.get_all_no_pag("jobs");
    for (let job of jobs) {
      if (job.company == req.params.company_id) {
        await db.delete_id("jobs", job.id);
      }
    }
    await db.delete_id("companies", req.params.company_id);
    return res.status(204).send();
  }
});

router.delete("/", (req, res) => {
  res.set("Accept", "GET, POST");
  res.status(405).end();
});

router.put("/", (req, res) => {
  res.set("Accept", "GET, POST");
  res.status(405).end();
});

module.exports = router;

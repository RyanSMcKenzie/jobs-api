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
    body("title").exists(),
    body("company").exists(),
    body("salary").exists(),
    body("experience").exists(),
  ],
  async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res
        .status(400)
        .json({ Error: "Request object has missing or invalid attributes" });
    } else if (!req.accepts(["application/json"])) {
      return res.status(406).send("Invalid Content-type requested");
    } else if (
      req.user === undefined ||
      req.user.sub === undefined ||
      req.user.iss !== "https://dev-rnvxg7n6.us.auth0.com/"
    ) {
      return res
        .status(401)
        .json({ Error: "Missing or invalid authorization" });
    } else {
      let data = {
        title: req.body.title,
        company: req.body.company,
        salary: req.body.salary,
        experience: req.body.experience,
        user: req.user.sub,
      };

      let created = await db.post_data("jobs", data);
      data.id = created.id;
      data.self =
        req.protocol +
        "://" +
        req.get("host") +
        req.originalUrl +
        `/${created.id}`;
      let company_id = data.company;
      data.company = await db.get_by_id("companies", company_id);
      data.company.self =
        req.protocol + "://" + req.get("host") + "/companies/" + company_id;
      return res.status(201).json(data);
    }
  }
);

router.get("/", async (req, res) => {
  let acceptable = req.accepts(["application/json"]);
  if (!acceptable) {
    return res.status(406).send("Invalid Content-type requested");
  }
  let off = req.query.offset !== undefined ? parseInt(req.query.offset, 10) : 0;
  let jobs = await db.get_all("jobs", off);
  let data = {};
  data["jobs"] = jobs[0];
  let company_id;
  let company;
  for (let job of data["jobs"]) {
    job["self"] = req.protocol + "://" + req.get("host") + "/jobs/" + job.id;
    company_id = job.company;

    company = await db.get_by_id("companies", company_id);

    job["company"] = company;
    job["company"]["self"] =
      req.protocol + "://" + req.get("host") + "/companies/" + company_id;
    job["company"]["id"] = company_id;
  }

  if (jobs[1].moreResults !== Datastore.NO_MORE_RESULTS) {
    data["next"] =
      req.protocol + "://" + req.get("host") + "/jobs/" + `?offset=${off + 5}`;
  }
  return res.status(200).json(data);
});

router.get("/:job_id", async (req, res) => {
  let acceptable = req.accepts(["application/json"]);
  if (!acceptable) {
    return res.status(406).send("Invalid Content-type requested");
  }
  let job = await db.get_by_id("jobs", req.params.job_id);
  if (job === undefined) {
    return res.status(404).json({ Error: "No job with this job_id exists" });
  } else {
    let data = {
      id: req.params.job_id,
      title: job.title,
      company: job.company,
      salary: job.salary,
      experience: job.experience,
      user: job.user,
      self: req.protocol + "://" + req.get("host") + req.originalUrl,
    };
    data.company = await db.get_by_id("companies", data.company);
    return res.status(200).json(data);
  }
});

router.put(
  "/:job_id",
  checkJwt,
  [
    body("title").exists(),
    body("company").exists(),
    body("salary").exists(),
    body("experience").exists(),
  ],
  async (req, res) => {
    if (!req.accepts(["application/json"])) {
      return res.status(406).send("Invalid Content-type requested");
    } else if (!validationResult(req).isEmpty()) {
      return res.status(400).json({
        Error:
          "The request object is missing at least one of the required attributes",
      });
    } else if (
      req.user === undefined ||
      req.user.sub === undefined ||
      req.user.iss !== "https://dev-rnvxg7n6.us.auth0.com/"
    ) {
      return res
        .status(401)
        .json({ Error: "Missing or invalid authorization" });
    }
    let current = await db.get_by_id("jobs", req.params.job_id);
    if (current === undefined) {
      return res.status(404).json({ Error: "No job with this job_id exists" });
    } else if (
      req.body.company !== current.company ||
      req.user.sub !== current.user
    ) {
      return res.status(403).json({
        Error:
          "Changing the company associated with a job is forbidden / You are not the user associated with this posting",
      });
    } else {
      let data = {
        title: req.body.title,
        company: req.body.company,
        salary: req.body.salary,
        experience: req.body.experience,
        user: req.user.sub,
      };
      await db.update_id("jobs", req.params.job_id, data);
      data.id = req.params.job_id;
      data.company = await db.get_by_id("companies", data.company);
      data.self = req.protocol + "://" + req.get("host") + req.originalUrl;
      return res.status(200).json(data);
    }
  }
);

router.patch("/:job_id", checkJwt, async (req, res) => {
  if (!req.accepts(["application/json"])) {
    return res.status(406).send("Invalid Content-type requested");
  } else if (
    req.user === undefined ||
    req.user.sub === undefined ||
    req.user.iss !== "https://dev-rnvxg7n6.us.auth0.com/"
  ) {
    return res.status(401).json({ Error: "Missing or invalid authorization" });
  }
  if ("company" in req.body) {
    return res.status(403).json({
      Error: "Changing the company associated with a job is forbidden",
    });
  }
  let job = await db.get_by_id("jobs", req.params.job_id);
  if (job === undefined) {
    return res.status(404).json({ Error: "No job with this job_id exists" });
  } else if (job.user !== req.user.sub) {
    return res
      .status(403)
      .json({ Error: "You are not the user associated with this posting" });
  } else {
    let title = "title" in req.body ? req.body.title : job.title;
    let company = job.company;
    let salary = "salary" in req.body ? req.body.salary : job.salary;
    let exp = "experience" in req.body ? req.body.experience : job.experience;
    let data = {
      title: title,
      company: company,
      salary: salary,
      experience: exp,
      user: req.user.sub,
    };

    await db.update_id("jobs", req.params.job_id, data);
    data.company = await db.get_by_id("companies", data.company);
    data.id = req.params.job_id;
    data.self = req.protocol + "://" + req.get("host") + req.originalUrl;
    return res.status(200).json(data);
  }
});

router.put("/:job_id/companies/:company_id", async (req, res) => {});

router.delete("/:job_id/companies/:company_id", async (req, res) => {});

router.delete("/:job_id", checkJwt, async (req, res) => {
  let exists = await db.get_by_id("jobs", req.params.job_id);
  
  if (
    req.user === undefined ||
    req.user.sub === undefined ||
    req.user.iss !== "https://dev-rnvxg7n6.us.auth0.com/"
  ) {
    return res.status(401).json({ Error: "Missing or invalid authorization" });
  }
  console.log(req.user.sub);
  if (exists === undefined) {
    return res.status(404).json({ Error: "No job with this job_id exists" });
  } else if (exists.user !== req.user.sub) {
    return res
      .status(403)
      .json({ Error: "You are not the user associated with this posting" });
  } else {
    db.delete_id("jobs", req.params.job_id);
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

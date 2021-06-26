const { Datastore } = require("@google-cloud/datastore");
const datastore = new Datastore();

function fromDatastore(item) {
  item.id = item[Datastore.KEY].id;
  return item;
}

function post_data(entity, data) {
  let key = datastore.key(entity);
  const new_company = data;
  return datastore.save({ key: key, data: new_company }).then(() => {
    return key;
  });
}

async function get_company_by_name(name) {
  let query = datastore.createQuery("companies").filter("name", "=", name);
  let company = await datastore.runQuery(query);
  return company[0];
}

async function get_jobs_by_company(company_id) {
    let query = datastore.createQuery("jobs").filter("company", "=", company_id);
    let jobs = await datastore.runQuery(query);
    return jobs[0].map(fromDatastore);
}

async function get_all(entity, offset) {
  let query = datastore.createQuery(entity).limit(5);
  if (offset !== 0) {
      query = query.start(offset);
  }
  let companies = await datastore.runQuery(query);
  return [companies[0].map(fromDatastore), companies[1]];
}

async function get_all_no_pag(entity) {
    let query = datastore.createQuery(entity);
    let companies = await datastore.runQuery(query);
    return companies[0].map(fromDatastore);
  }

async function get_by_id(entity, id) {
  let key = datastore.key([entity, parseInt(id, 10)]);
  let ret = await datastore.get(key);
  return ret[0];
}

async function update_id(entity, id, data) {
  let key = datastore.key([entity, parseInt(id, 10)]);
  let updated = data;
  updated = await datastore.save({ key: key, data: updated });
  return updated;
}

function delete_id(entity, id) {
  const key = datastore.key([entity, parseInt(id, 10)]);
  return datastore.delete(key);
}

module.exports = {
  post_data,
  get_company_by_name,
  get_all,
  get_by_id,
  update_id,
  delete_id,
  get_jobs_by_company,
  get_all_no_pag
};

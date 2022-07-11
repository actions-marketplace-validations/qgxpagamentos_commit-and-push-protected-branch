const axios = require('axios');
const core = require('@actions/core');
const simpleGit = require('simple-git');
const path = require('path');
const {
  GITHUB_REPOSITORY,
  GIT_APP_TOKEN,
  GITHUB_REF_NAME = 'master',
} = process.env;
const API_V3_BASE = 'https://api.github.com';

const baseDir = path.join(process.cwd(), core.getInput('cwd') || '');
const git = simpleGit({ baseDir });

const apiRequest = async (url, method = 'get', payload = undefined) => {
  const config = {
    method: method,
    url: `${API_V3_BASE}${url}`,
    headers: {
      Authorization: `token ${GIT_APP_TOKEN}`,
    },
  };
  if (payload) {
    config['data'] = JSON.stringify(payload);
  }
  const { data } = await axios(config);
  return data;
};

/**
 * Remove branch protections
 * @returns protections
 */
const removeBranchProtection = async () => {
  const url = `/repos/${GITHUB_REPOSITORY}/branches/${GITHUB_REF_NAME}/protection`;

  core.info('Looking for current branch protection rules.');

  const data = await apiRequest(url);
  const payload = {
    dismiss_stale_reviews: data?.dismiss_stale_reviews,
    require_code_owner_reviews: data?.require_code_owner_reviews,
    required_approving_review_count: data?.required_approving_review_count,
  };

  const repos = await apiRequest(`/repos/${GITHUB_REPOSITORY}`);
  const users = data?.dismissal_restrictions?.users || [];
  const teams = data?.dismissal_restrictions?.teams || [];

  if (repos && repos.organization) {
    payload['dismissal_restrictions'] = {
      users: [...users],
      teams: [...teams],
    };
  }

  core.info(JSON.stringify(payload));

  core.info('Removing branch protection.');
  const result = await apiRequest(url, 'delete');
  core.info(JSON.stringify(result));

  return payload;
};

/**
 * Add branch permissions
 * @param {*} payload
 */
const addBranchProtection = async (payload) => {
  const url = `/repos/${GITHUB_REPOSITORY}/branches/${GITHUB_REF_NAME}/protection`;
  core.info('Re-adding protection branch rules.');
  core.info(url);
  await apiRequest(url, 'put', payload);
};

/**
 * Commit files
 */
const gitAddAndCommit = async () => {
  core.info('Pushing to remote Github.');
  const email =
    core.getInput('email') || 'github-actions[bot]@users.noreply.github.com';
  const name = core.getInput('name') || 'github-actions[bot]';
  const message = core.getInput('message') || 'Updated by Github Actions :)';
  await git.addConfig('user.email', email).addConfig('user.name', name);
  await git.add('.');
  await git.commit(message);
  await git.push('origin', GITHUB_REF_NAME);
};

const main = async () => {
  try {
    const protections = await removeBranchProtection();
    await gitAddAndCommit();
    await addBranchProtection(protections);
    core.info('successfully');
  } catch (e) {
    core.setFailed(e);
  }
};

main();

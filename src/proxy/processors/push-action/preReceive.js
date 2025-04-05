const fs = require('fs');
const path = require('path');
const Step = require('../../actions').Step;
const { spawnSync } = require('child_process');

const sanitizeInput = (_req, action) => {
  return `${action.commitFrom} ${action.commitTo} ${action.branch} \n`;
};

const exec = async (req, action, hookFilePath = './hooks/pre-receive.sh') => {
  const step = new Step('executeExternalPreReceiveHook');
  let stderrTrimmed = '';

  try {
    const resolvedPath = path.resolve(hookFilePath);
    const hookDir = path.dirname(resolvedPath);

    if (!fs.existsSync(hookDir) || !fs.existsSync(resolvedPath)) {
      step.log('Pre-receive hook not found, skipping execution.');
      action.addStep(step);
      return action;
    }

    const repoPath = `${action.proxyGitPath}/${action.repoName}`;

    step.log(`Executing pre-receive hook from: ${resolvedPath}`);

    const sanitizedInput = sanitizeInput(req, action);

    const hookProcess = spawnSync(resolvedPath, [], {
      input: sanitizedInput,
      encoding: 'utf-8',
      cwd: repoPath,
    });

    const { stdout, stderr, status } = hookProcess;

    stderrTrimmed = stderr ? stderr.trim() : '';
    const stdoutTrimmed = stdout ? stdout.trim() : '';

    step.log(`Hook exited with status ${status}`);

    if (status === 0) {
      step.log('Push automatically approved by pre-receive hook.');
      action.addStep(step);
      action.setAutoApproval();
    } else if (status === 1) {
      step.log('Push automatically rejected by pre-receive hook.');
      action.addStep(step);
      action.setAutoRejection();
    } else if (status === 2) {
      step.log('Push requires manual approval.');
      action.addStep(step);
    } else {
      step.error = true;
      step.log(`Unexpected hook status: ${status}`);
      step.setError(stdoutTrimmed || 'Unknown pre-receive hook error.');
      action.addStep(step);
    }
    return action;
  } catch (error) {
    step.error = true;
    step.log('Push failed, pre-receive hook returned an error.');
    step.setError(`Hook execution error: ${stderrTrimmed || error.message}`);
    action.addStep(step);
    return action;
  }
};

exec.displayName = 'executeExternalPreReceiveHook.exec';
exports.exec = exec;

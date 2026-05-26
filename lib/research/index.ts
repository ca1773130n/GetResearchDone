'use strict';
const thread = require('./thread');
const orchestrator = require('./orchestrator');
const cli = require('./cli');
const cliKb = require('./cli-kb');
const ingestMod = require('./ingest');
const synthesizeMod = require('./synthesize');

module.exports = {
  createThread: thread.createThread,
  loadThread: thread.loadThread,
  listThreads: thread.listThreads,
  threadId: thread.threadId,
  runResearch: orchestrator.runResearch,
  resumeResearch: orchestrator.resumeResearch,
  cmdResearchStart: cli.cmdResearchStart,
  cmdResearchResume: cli.cmdResearchResume,
  cmdResearchStatus: cli.cmdResearchStatus,
  cmdIngest: cliKb.cmdIngest,
  cmdSynthesize: cliKb.cmdSynthesize,
  ingest: ingestMod.ingest,
  synthesize: synthesizeMod.synthesize,
};

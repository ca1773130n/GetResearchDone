#!/usr/bin/env node

const fs = require('fs');

const TASKS_FILE = 'tasks.md';

function loadTasks() {
  const content = fs.readFileSync(TASKS_FILE, 'utf-8');
  const lines = content.split('\n');
  const tasks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('- [ ] ')) {
      tasks.push({ id: tasks.length + 1, text: line.slice(6), done: false });
    } else if (line.startsWith('- [x] ')) {
      tasks.push({ id: tasks.length + 1, text: line.slice(6), done: true });
    }
  }
  return tasks;
}

function saveTasks(tasks) {
  const lines = tasks.map(function (t) {
    return '- [' + (t.done ? 'x' : ' ') + '] ' + t.text;
  });
  fs.writeFileSync(TASKS_FILE, '# Tasks\n\n' + lines.join('\n') + '\n');
}

function addTask(text) {
  const tasks = loadTasks();
  tasks.push({ id: tasks.length + 1, text: text, done: false });
  saveTasks(tasks);
  console.log('Added: ' + text);
}

function listTasks() {
  const tasks = loadTasks();
  if (tasks.length === 0) {
    console.log('No tasks found.');
    return;
  }
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const status = task.done ? 'x' : ' ';
    console.log('  ' + task.id + '. [' + status + '] ' + task.text);
  }
}

function completeTask(id) {
  const tasks = loadTasks();
  tasks[id - 1].done = true;
  saveTasks(tasks);
  console.log('Done: ' + tasks[id - 1].text);
}

function searchTasks(query) {
  const tasks = loadTasks();
  const results = tasks.filter(function (t) {
    return t.text.includes(query);
  });
  if (results.length === 0) {
    console.log('No matching tasks.');
    return;
  }
  for (let i = 0; i < results.length; i++) {
    const task = results[i];
    const status = task.done ? 'x' : ' ';
    console.log('  ' + task.id + '. [' + status + '] ' + task.text);
  }
}

const command = process.argv[2];
const arg = process.argv.slice(3).join(' ');

if (command === 'add') {
  addTask(arg);
} else if (command === 'list') {
  listTasks();
} else if (command === 'done') {
  completeTask(parseInt(arg));
} else if (command === 'search') {
  searchTasks(arg);
} else {
  console.log('Usage: taskmark <add|list|done|search> [args]');
}

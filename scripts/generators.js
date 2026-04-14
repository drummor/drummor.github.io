'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

hexo.extend.generator.register('thoughts', function(locals) {
  const thoughtsDir = path.join(hexo.base_dir, 'source/thoughts');
  if (!fs.existsSync(thoughtsDir)) return [];

  const files = fs.readdirSync(thoughtsDir).filter(f => f.endsWith('.md') && f !== 'index.md');
  files.sort();

  const thoughts = files.map(file => {
    const fullPath = path.join(thoughtsDir, file);
    const raw = fs.readFileSync(fullPath, 'utf8');

    // Split frontmatter
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = yaml.load(match[1]);
    const rawContent = match[2].trim();
    const slug = file.replace('.md', '');

    // Render markdown to HTML using Hexo's renderer
    const content = hexo.render.renderSync({ text: rawContent, path: fullPath });

    return {
      title: frontmatter.title || slug,
      date: frontmatter.date ? new Date(frontmatter.date) : new Date(),
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : (frontmatter.tags ? [frontmatter.tags] : []),
      content: content,
      slug: slug
    };
  }).filter(Boolean);

  // Sort by date descending
  thoughts.sort((a, b) => b.date - a.date);

  const result = [];

  // List page
  result.push({
    path: 'thoughts/index.html',
    layout: 'thoughts',
    data: {
      isList: true,
      thoughts: thoughts,
      __permalink: 'thoughts/index'
    }
  });

  // Individual pages
  thoughts.forEach(thought => {
    result.push({
      path: `thoughts/${thought.slug}.html`,
      layout: 'thoughts',
      data: Object.assign({}, thought, { isList: false, __permalink: `thoughts/${thought.slug}` })
    });
  });

  return result;
});

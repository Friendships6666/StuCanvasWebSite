import { getLocale, onLocaleChange } from '/src/i18n.js';

const settings = document.getElementById('settings');
const links = [
  { href: '/tutorials', labels: { en: 'Tutorials and docs', 'zh-CN': '教程与文档', 'zh-TW': '教學與文件' } },
  { href: '/THIRD_PARTY_NOTICES.txt', labels: { en: 'Third-party licenses', 'zh-CN': '第三方许可', 'zh-TW': '第三方授權' } },
];
for (const link of links) {
  link.element = document.createElement('a');
  link.element.className = 'website-link';
  link.element.href = link.href;
  settings.append(link.element);
}
function update() {
  const locale = getLocale();
  for (const link of links) link.element.textContent = link.labels[locale] || link.labels.en;
}
onLocaleChange(update);
update();

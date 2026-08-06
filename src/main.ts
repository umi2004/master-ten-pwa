import './styles/base.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('アプリの描画先が見つかりません。');
}

const heading = document.createElement('h1');
heading.textContent = 'Master Ten';

const message = document.createElement('p');
message.textContent = '高難易度の数字パズルを準備しています。';

app.append(heading, message);

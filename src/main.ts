import './styles/base.css';
import { MasterTenApp } from './ui/app';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('アプリの描画先が見つかりません。');
}

new MasterTenApp(app);

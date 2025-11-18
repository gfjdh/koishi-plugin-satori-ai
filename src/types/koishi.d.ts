import 'koishi';

declare module 'koishi' {
  interface Context {
    puppeteer: any;
    censor: any;
  }
}

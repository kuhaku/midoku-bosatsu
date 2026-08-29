import { textSearchRoot } from './text_search_scope.ts';

const timeline = document.createElement('div');
const savedPostsView = document.createElement('div');
const savedPostsContent = document.createElement('div');

const searchRoot: HTMLDivElement = textSearchRoot(timeline, savedPostsView, savedPostsContent);

void searchRoot;

export type PostFormUserField = 'author' | 'email' | 'subject' | 'body' | 'url';
export type PostFormFieldGroup = 'author-row' | 'email-row' | 'subject-actions' | 'main';
export type PostFormLabelLayout = 'inline' | 'stacked';
export type PostFormFieldWidth = 'compact' | 'fluid';
export type PostFormFieldItem = 'encoding-warning' | 'field';

export function postFormFieldGroup(userField: PostFormUserField): PostFormFieldGroup {
  if (userField === 'author') return 'author-row';
  if (userField === 'email') return 'email-row';
  if (userField === 'subject') return 'subject-actions';
  return 'main';
}

export function postFormLabelLayout(userField: PostFormUserField): PostFormLabelLayout {
  return userField === 'body' ? 'stacked' : 'inline';
}

export function postFormFieldWidth(userField: PostFormUserField): PostFormFieldWidth {
  return userField === 'author' || userField === 'email' ? 'compact' : 'fluid';
}

export function postFormFieldItemOrder(userField: PostFormUserField): PostFormFieldItem[] {
  return userField === 'body' ? ['encoding-warning', 'field'] : ['field'];
}

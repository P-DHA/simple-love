// 简爱 Simple Love - 全局样式常量
export const colors = {
  bg: '#FFF6F8',
  card: '#FFFFFF',
  primary: '#FF5C77',
  primaryDark: '#E8465F',
  primarySoft: '#FFE4EA',
  text: '#3B2C35',
  sub: '#9A8B94',
  line: '#F3DCE2',
  danger: '#E5484D',
  warn: '#E8A13A',
  ok: '#33B577',
};

export const container = {
  flex: 1,
  backgroundColor: colors.bg,
  paddingHorizontal: 20,
  paddingTop: 48,
};

export const primaryButton = {
  backgroundColor: colors.primary,
  borderRadius: 16,
  paddingVertical: 16,
  alignItems: 'center',
  justifyContent: 'center',
};

export const dangerButton = {
  backgroundColor: colors.danger,
  borderRadius: 16,
  paddingVertical: 16,
  alignItems: 'center',
  justifyContent: 'center',
};

export const ghostButton = {
  backgroundColor: colors.primarySoft,
  borderRadius: 14,
  paddingVertical: 12,
  paddingHorizontal: 14,
  alignItems: 'center',
  justifyContent: 'center',
};

export const btnText = {
  color: '#FFFFFF',
  fontSize: 16,
  fontWeight: '700',
};

export const btnTextGhost = {
  color: colors.primaryDark,
  fontSize: 14,
  fontWeight: '700',
};

export const card = {
  backgroundColor: colors.card,
  borderRadius: 18,
  padding: 16,
  marginBottom: 14,
  // 安卓上阴影支持有限，用边框代替
  borderWidth: 1,
  borderColor: colors.line,
};

export const sectionTitle = {
  fontSize: 15,
  fontWeight: '700',
  color: colors.text,
  marginBottom: 10,
};

export const input = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: colors.text,
};

export const hintText = {
  fontSize: 12,
  color: colors.sub,
  lineHeight: 18,
};

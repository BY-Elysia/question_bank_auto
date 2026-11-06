export const navigate = (id?: string) => {
  window.location.hash = id ? `/workspace/${id}` : '/';
};

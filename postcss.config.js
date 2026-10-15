module.exports = {
  plugins: {
    // Keep our Tailwind 3 build separate from Scalar's Tailwind 4 peer dependency.
    // The alias is dev-only and is not part of the production dependency tree.
    'tailwindcss-build': {},
    autoprefixer: {},
  },
};

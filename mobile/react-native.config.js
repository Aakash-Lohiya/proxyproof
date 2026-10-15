// react-native-ble-advertiser declares its Java classes in package
// `com.vitorpamplona.bleavertiser` (sic, missing "d") while its folder name says
// `bleadvertiser`, so autolinking guesses the wrong import. Spell it out here.
module.exports = {
  dependencies: {
    'react-native-ble-advertiser': {
      platforms: {
        android: {
          packageImportPath: 'import com.vitorpamplona.bleavertiser.BLEAdvertiserPackage;',
          packageInstance: 'new BLEAdvertiserPackage()',
        },
        ios: null,
      },
    },
  },
};

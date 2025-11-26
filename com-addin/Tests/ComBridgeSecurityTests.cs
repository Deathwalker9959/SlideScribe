using System;
using com_addin;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace ComBridge.Tests
{
    [TestClass]
    public class ComBridgeSecurityTests
    {
        private const string TokenEnv = "SLIDESCRIBE_BRIDGE_TOKEN";
        private string _originalToken;

        [TestInitialize]
        public void SetUp()
        {
            _originalToken = Environment.GetEnvironmentVariable(TokenEnv);
        }

        [TestCleanup]
        public void TearDown()
        {
            if (_originalToken == null)
            {
                Environment.SetEnvironmentVariable(TokenEnv, null);
            }
            else
            {
                Environment.SetEnvironmentVariable(TokenEnv, _originalToken);
            }
        }

        [TestMethod]
        public void IsAuthorized_Allows_When_Token_Matches()
        {
            Environment.SetEnvironmentVariable(TokenEnv, "secret");
            var message = new ComBridgeMessage
            {
                Method = "test",
                Parameters = { { "authToken", "secret" } }
            };

            var allowed = ComBridgeSecurity.IsAuthorized(message, out var error);

            Assert.IsTrue(allowed);
            Assert.IsNull(error);
        }

        [TestMethod]
        public void IsAuthorized_Blocks_When_Token_Missing()
        {
            Environment.SetEnvironmentVariable(TokenEnv, "secret");
            var message = new ComBridgeMessage { Method = "test" };

            var allowed = ComBridgeSecurity.IsAuthorized(message, out var error);

            Assert.IsFalse(allowed);
            Assert.AreEqual("Unauthorized", error);
        }

        [TestMethod]
        public void IsAuthorized_Blocks_When_Config_Missing()
        {
            Environment.SetEnvironmentVariable(TokenEnv, null);
            var message = new ComBridgeMessage { Method = "test" };

            var allowed = ComBridgeSecurity.IsAuthorized(message, out var error);

            Assert.IsFalse(allowed);
            StringAssert.Contains(error, "Missing required auth token");
        }

        [TestMethod]
        public void IsAuthorized_Blocks_When_Token_Mismatch()
        {
            Environment.SetEnvironmentVariable(TokenEnv, "secret");
            var message = new ComBridgeMessage
            {
                Method = "test",
                Parameters = { { "authToken", "other" } }
            };

            var allowed = ComBridgeSecurity.IsAuthorized(message, out var error);

            Assert.IsFalse(allowed);
            Assert.AreEqual("Unauthorized", error);
        }

        [TestMethod]
        public void IsHttpsUrl_Only_Allows_Https()
        {
            Assert.IsTrue(ComBridgeSecurity.IsHttpsUrl("https://example.com/audio.mp3"));
            Assert.IsFalse(ComBridgeSecurity.IsHttpsUrl("http://example.com/audio.mp3"));
            Assert.IsFalse(ComBridgeSecurity.IsHttpsUrl("ftp://example.com/file"));
            Assert.IsFalse(ComBridgeSecurity.IsHttpsUrl(string.Empty));
        }
    }
}

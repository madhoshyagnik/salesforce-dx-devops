@isTest
private class HelloWorldTest {
  @isTest
  static void testSayHello() {
    Test.startTest();
    String result = HelloWorld.sayHello();
    Test.stopTest();

    System.assertEquals(
      'Hello, Salesforce!',
      result,
      'Expected greeting message to match'
    );
  }
}

import java.util.*;
public class RngRef {
  static String q(String s){return "\""+s+"\"";}
  public static void main(String[] a){
    long[] seeds={0L,1L,42L,-1L,123456789L,-987654321012345L,Long.MAX_VALUE,Long.MIN_VALUE,1792298260372L,20261017L};
    int[] bounds={1,2,3,5,7,10,16,64,100,1000,1<<30,(1<<30)+1,Integer.MAX_VALUE};
    StringBuilder sb=new StringBuilder("{\n  \"source\": \"java.util.Random and Collections.shuffle, JDK "+System.getProperty("java.version")+" (RngRef.java)\",\n  \"cases\": [\n");
    boolean first=true;
    for(long s:seeds){
      Random r=new Random(s);
      StringBuilder c=new StringBuilder();
      c.append("{\"seed\":\"").append(s).append("\"");
      c.append(",\"nextInt\":["); for(int i=0;i<8;i++){c.append(i>0?",":"").append(r.nextInt());} c.append("]");
      c.append(",\"nextIntBound\":["); for(int b:bounds){for(int i=0;i<3;i++){c.append(c.charAt(c.length()-1)=='['?"":",").append("[").append(b).append(",").append(r.nextInt(b)).append("]");}} c.append("]");
      c.append(",\"nextLong\":["); for(int i=0;i<4;i++){c.append(i>0?",":"").append("\"").append(r.nextLong()).append("\"");} c.append("]");
      c.append(",\"nextBoolean\":["); for(int i=0;i<8;i++){c.append(i>0?",":"").append(r.nextBoolean());} c.append("]");
      c.append(",\"nextDouble\":["); for(int i=0;i<4;i++){c.append(i>0?",":"").append(r.nextDouble());} c.append("]");
      c.append(",\"nextFloat\":["); for(int i=0;i<4;i++){c.append(i>0?",":"").append(r.nextFloat());} c.append("]");
      // shuffle with a fresh Random(seed): sizes 1..12 and 40, chained on one generator
      Random r2=new Random(s);
      c.append(",\"shuffle\":[");
      int[] sizes={1,2,3,4,5,6,8,12,40};
      for(int k=0;k<sizes.length;k++){List<Integer> l=new ArrayList<>(); for(int i=0;i<sizes[k];i++) l.add(i); Collections.shuffle(l,r2); c.append(k>0?",":"").append(l.toString().replace(" ",""));}
      c.append("]}");
      sb.append(first?"    ":",\n    ").append(c); first=false;
    }
    sb.append("\n  ]\n}\n");
    System.out.print(sb);
  }
}
